import React from "react";
import { resolveMedia, PLACEHOLDER_MEDIA, onMediaError } from "@/lib/media";

/**
 * Image with automatic placeholder fallback on load failure.
 * Pass raw stored URL; set resolved={false} if src is already resolved.
 */
export const MediaImg = ({
  src,
  alt = "",
  resolved = false,
  className,
  style,
  loading,
  ...rest
}) => {
  const url = resolved ? (src || PLACEHOLDER_MEDIA) : resolveMedia(src);
  return (
    <img
      src={url || PLACEHOLDER_MEDIA}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      onError={onMediaError}
      {...rest}
    />
  );
};

export default MediaImg;
