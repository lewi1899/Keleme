"use client";

import { useState } from "react";
import { PlayCircle } from "lucide-react";

/**
 * Facade-then-embed: shows YouTube's thumbnail with a play button and only
 * loads the iframe once the student actually presses play.
 *
 * The reason is bandwidth, not tidiness. A YouTube iframe pulls roughly a
 * megabyte of player JavaScript before a single frame of video — on a slow
 * mobile connection that is several seconds and real money for a student who
 * may only have wanted the notes below it. The thumbnail is ~15KB.
 *
 * youtube-nocookie.com is used so the student is not tracked until they choose
 * to watch.
 */
export function YouTubeEmbed({ videoId, title }: { videoId: string; title: string }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-kl-border bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play video: ${title}`}
      className="kl-press group relative block aspect-video w-full overflow-hidden rounded-2xl border border-kl-border bg-black"
    >
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover opacity-85 transition-opacity group-hover:opacity-100"
      />
      <span className="absolute inset-0 grid place-items-center">
        <PlayCircle
          size={64}
          className="text-white drop-shadow-lg transition-transform duration-300 ease-kl-spring group-hover:scale-110"
          aria-hidden
        />
      </span>
    </button>
  );
}
