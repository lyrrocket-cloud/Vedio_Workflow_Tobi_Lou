'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Upload, Play, ArrowRight, Sparkles, Download, Image as ImageIcon } from 'lucide-react';

interface UploadResponse {
  success: boolean;
  url?: string;
  error?: string;
}

interface GenerateResponse {
  success: boolean;
  videoUrl?: string;
  error?: string;
}

export default function TransitionVideoGenerator() {
  const [firstFrame, setFirstFrame] = useState<File | null>(null);
  const [lastFrame, setLastFrame] = useState<File | null>(null);
  const [firstFramePreview, setFirstFramePreview] = useState<string>('');
  const [lastFramePreview, setLastFramePreview] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('Smooth transition between scenes');
  const [duration, setDuration] = useState<number>(5);
  const [resolution, setResolution] = useState<string>('720p');
  const [ratio, setRatio] = useState<string>('16:9');
  const [generateAudio, setGenerateAudio] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback((
    file: File,
    setFile: (file: File | null) => void,
    setPreview: (preview: string) => void
  ) => {
    if (file && file.type.startsWith('image/')) {
      setFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDrop = useCallback((
    e: React.DragEvent,
    setFile: (file: File | null) => void,
    setPreview: (preview: string) => void
  ) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleImageUpload(file, setFile, setPreview);
    }
  }, [handleImageUpload]);

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const data: UploadResponse = await response.json();
    if (!data.success || !data.url) {
      throw new Error(data.error || 'Upload failed');
    }
    return data.url;
  };

  const handleGenerate = async () => {
    if (!firstFrame || !lastFrame) {
      setError('Please upload both first and last frame images');
      return;
    }

    setIsGenerating(true);
    setError('');
    setVideoUrl('');

    try {
      // Upload both images
      const [firstFrameUrl, lastFrameUrl] = await Promise.all([
        uploadImage(firstFrame),
        uploadImage(lastFrame),
      ]);

      // Generate video
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstFrameUrl,
          lastFrameUrl,
          prompt,
          duration,
          resolution,
          ratio,
          generateAudio,
        }),
      });

      const data: GenerateResponse = await response.json();
      if (!data.success || !data.videoUrl) {
        throw new Error(data.error || 'Video generation failed');
      }

      setVideoUrl(data.videoUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!videoUrl) return;
    
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transition-video-${Date.now()}.mp4`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download video');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Sparkles className="w-8 h-8 text-purple-400" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Transition Video Generator
            </h1>
          </div>
          <p className="text-slate-400 text-lg">
            Upload first and last frame images to create stunning AI-powered transition videos
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Upload & Settings */}
          <div className="space-y-6">
            {/* Image Upload Section */}
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-purple-400" />
                  Frame Upload
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Upload your start and end frame images
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {/* First Frame */}
                  <div
                    className={`relative aspect-video rounded-xl border-2 border-dashed transition-all duration-300 ${
                      firstFramePreview 
                        ? 'border-purple-500 bg-purple-500/10' 
                        : 'border-slate-600 hover:border-purple-400 bg-slate-800/50'
                    }`}
                    onDrop={(e) => handleDrop(e, setFirstFrame, setFirstFramePreview)}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => firstFrameInputRef.current?.click()}
                  >
                    {firstFramePreview ? (
                      <img 
                        src={firstFramePreview} 
                        alt="First frame" 
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                        <Upload className="w-8 h-8 mb-2" />
                        <span className="text-sm font-medium">First Frame</span>
                        <span className="text-xs mt-1">Click or drag</span>
                      </div>
                    )}
                    <input
                      ref={firstFrameInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, setFirstFrame, setFirstFramePreview);
                      }}
                    />
                  </div>

                  {/* Last Frame */}
                  <div
                    className={`relative aspect-video rounded-xl border-2 border-dashed transition-all duration-300 ${
                      lastFramePreview 
                        ? 'border-pink-500 bg-pink-500/10' 
                        : 'border-slate-600 hover:border-pink-400 bg-slate-800/50'
                    }`}
                    onDrop={(e) => handleDrop(e, setLastFrame, setLastFramePreview)}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => lastFrameInputRef.current?.click()}
                  >
                    {lastFramePreview ? (
                      <img 
                        src={lastFramePreview} 
                        alt="Last frame" 
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                        <Upload className="w-8 h-8 mb-2" />
                        <span className="text-sm font-medium">Last Frame</span>
                        <span className="text-xs mt-1">Click or drag</span>
                      </div>
                    )}
                    <input
                      ref={lastFrameInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, setLastFrame, setLastFramePreview);
                      }}
                    />
                  </div>
                </div>

                {/* Transition Arrow */}
                {firstFramePreview && lastFramePreview && (
                  <div className="flex items-center justify-center mt-4 text-purple-400">
                    <div className="flex items-center gap-2 bg-purple-500/20 px-4 py-2 rounded-full">
                      <span className="text-sm">Start</span>
                      <ArrowRight className="w-4 h-4" />
                      <span className="text-sm">End</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Settings Section */}
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white">Generation Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Prompt */}
                <div className="space-y-2">
                  <Label className="text-slate-300">Transition Prompt</Label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the transition effect..."
                    className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 resize-none"
                    rows={3}
                  />
                </div>

                {/* Duration */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-300">Duration</Label>
                    <span className="text-purple-400 font-medium">{duration}s</span>
                  </div>
                  <Slider
                    value={[duration]}
                    onValueChange={(value) => setDuration(value[0])}
                    min={4}
                    max={12}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Resolution & Ratio */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Resolution</Label>
                    <Select value={resolution} onValueChange={setResolution}>
                      <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="480p">480p</SelectItem>
                        <SelectItem value="720p">720p</SelectItem>
                        <SelectItem value="1080p">1080p</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Aspect Ratio</Label>
                    <Select value={ratio} onValueChange={setRatio}>
                      <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="16:9">16:9</SelectItem>
                        <SelectItem value="9:16">9:16</SelectItem>
                        <SelectItem value="1:1">1:1</SelectItem>
                        <SelectItem value="4:3">4:3</SelectItem>
                        <SelectItem value="3:4">3:4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Audio Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-slate-300">Generate Audio</Label>
                    <p className="text-xs text-slate-500 mt-1">AI-generated sound effects and music</p>
                  </div>
                  <Switch
                    checked={generateAudio}
                    onCheckedChange={setGenerateAudio}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !firstFrame || !lastFrame}
              className="w-full h-14 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold text-lg rounded-xl shadow-lg shadow-purple-500/25 transition-all duration-300 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Generating Video...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  Generate Transition Video
                </>
              )}
            </Button>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Right Column - Video Preview */}
          <div className="space-y-6">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm h-full">
              <CardHeader>
                <CardTitle className="text-white flex items-center justify-between">
                  <span>Generated Video</span>
                  {videoUrl && (
                    <Button
                      onClick={handleDownload}
                      variant="outline"
                      size="sm"
                      className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {videoUrl ? (
                  <div className="aspect-video rounded-xl overflow-hidden bg-black">
                    <video
                      src={videoUrl}
                      controls
                      autoPlay
                      loop
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="aspect-video rounded-xl border-2 border-dashed border-slate-600 bg-slate-900/30 flex items-center justify-center">
                    <div className="text-center text-slate-500">
                      <Play className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">No video generated yet</p>
                      <p className="text-sm mt-2">Upload frames and click generate</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-slate-500 text-sm">
          Powered by AI Video Generation Model
        </div>
      </div>
    </div>
  );
}
