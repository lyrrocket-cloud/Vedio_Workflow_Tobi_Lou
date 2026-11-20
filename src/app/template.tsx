'use client';

import { useEffect } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/** 路由切换过渡：仅用独立全屏遮罩淡出，不影响页面内容容器 */
export default function Template({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <>
      {children}
      <div className="page-fade-overlay" aria-hidden="true" />
    </>
  );
}
