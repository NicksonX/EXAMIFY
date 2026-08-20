const MAX_SOURCE_AVATAR_BYTES = 10 * 1024 * 1024;
const MAX_STORED_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_AVATAR_EDGE = 1024;
const MAX_AVATAR_PIXELS = 20_000_000;

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("We couldn't prepare that image. Choose another picture."));
    }, "image/webp", quality);
  });
}

/**
 * Converts a browser-selected raster image to a bounded WebP avatar before it
 * crosses the network. The server repeats signature and size validation.
 */
export function trustedProviderAvatar(user: {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> | null }> | null;
} | null | undefined): string | null {
  if (!user) return null;
  const provider = typeof user.app_metadata?.provider === "string"
    ? user.app_metadata.provider
    : user.identities?.find((identity) => identity.provider)?.provider;
  if (provider !== "google") return null;

  const candidates = [
    user.user_metadata?.avatar_url,
    user.user_metadata?.picture,
    ...(user.identities ?? []).flatMap((identity) => [identity.identity_data?.avatar_url, identity.identity_data?.picture]),
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.length > 2048) continue;
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      if (
        url.protocol === "https:"
        && (
          host === "googleusercontent.com"
          || host.endsWith(".googleusercontent.com")
          || host === "google.com"
          || host.endsWith(".google.com")
        )
      ) return url.toString();
    } catch {
      // Ignore malformed provider metadata.
    }
  }
  return null;
}

export async function normalisedAvatar(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    throw new Error("Choose a standard photo or image file. SVG files are not supported for profile photos.");
  }
  if (file.size < 1 || file.size > MAX_SOURCE_AVATAR_BYTES) {
    throw new Error("Choose an image smaller than 10 MB.");
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("We couldn't read that image. Choose another picture."));
      image.src = sourceUrl;
    });
    if (
      !image.naturalWidth
      || !image.naturalHeight
      || image.naturalWidth * image.naturalHeight > MAX_AVATAR_PIXELS
    ) {
      throw new Error("Choose an image with smaller dimensions.");
    }

    const scale = Math.min(1, MAX_AVATAR_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("We couldn't prepare that image. Choose another picture.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let output = await canvasBlob(canvas, 0.86);
    if (output.size > MAX_STORED_AVATAR_BYTES) output = await canvasBlob(canvas, 0.68);
    if (output.size > MAX_STORED_AVATAR_BYTES) {
      throw new Error("That image is too detailed to save under 2 MB. Choose a smaller picture.");
    }
    return new File([output], "profile.webp", { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
