'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export type SplitLine = {
  text: string;
  className?: string;
};

/**
 * 逐字 SplitText 标题入场（GSAP）
 * 行容器 SSR 首帧 opacity: 0，避免 hydrate 前露出完整文字
 */
export function SplitTextTitle({
  lines,
  className,
  as: Tag = 'h1',
}: {
  lines: SplitLine[];
  className?: string;
  as?: 'h1' | 'h2';
}) {
  const rootRef = useRef<HTMLHeadingElement>(null);
  const maskRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const revealMasks = () => {
      maskRefs.current.forEach((el) => {
        if (el) el.style.opacity = '1';
      });
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      revealMasks();
      return;
    }

    const splits: SplitText[] = [];
    const chars: Element[] = [];

    root.querySelectorAll<HTMLElement>('[data-split-line]').forEach((line) => {
      const split = new SplitText(line, { type: 'chars', charsClass: 'split-char' });
      splits.push(split);
      chars.push(...split.chars);
    });

    if (!chars.length) {
      revealMasks();
      return;
    }

    gsap.set(root, { perspective: 900 });

    const tween = gsap.from(chars, {
      yPercent: 115,
      opacity: 0,
      rotateX: -75,
      filter: 'blur(8px)',
      duration: 0.95,
      ease: 'power3.out',
      stagger: 0.045,
      delay: 0.1,
    });

    revealMasks();

    return () => {
      tween.kill();
      splits.forEach((s) => s.revert());
    };
  }, []);

  return (
    <Tag ref={rootRef} className={className}>
      <noscript>
        <style>{`.split-line-mask{opacity:1 !important}`}</style>
      </noscript>
      {lines.map((line, i) => (
        <span
          key={i}
          ref={(el) => {
            maskRefs.current[i] = el;
          }}
          className="split-line-mask block overflow-hidden"
          style={{ opacity: 0 }}
        >
          <span data-split-line className={`inline-block will-change-transform ${line.className ?? ''}`}>
            {line.text}
          </span>
        </span>
      ))}
    </Tag>
  );
}
