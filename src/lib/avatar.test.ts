import { describe, expect, it } from "vitest";
import { trustedProviderAvatar } from "./avatar";

describe("trustedProviderAvatar", () => {
  it("accepts an HTTPS Google-hosted provider image", () => {
    expect(trustedProviderAvatar({
      app_metadata: { provider: "google" },
      user_metadata: { picture: "https://lh3.googleusercontent.com/a/example" },
    })).toBe("https://lh3.googleusercontent.com/a/example");
  });

  it("does not trust arbitrary metadata or an unsupported provider", () => {
    expect(trustedProviderAvatar({
      app_metadata: { provider: "google" },
      user_metadata: { picture: "https://avatar.example.test/photo.jpg" },
    })).toBeNull();
    expect(trustedProviderAvatar({
      app_metadata: { provider: "apple" },
      user_metadata: { picture: "https://lh3.googleusercontent.com/a/example" },
    })).toBeNull();
  });
});
