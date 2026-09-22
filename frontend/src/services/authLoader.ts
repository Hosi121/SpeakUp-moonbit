// Keep the forms usable before the shared MoonBit decoders arrive. Both forms
// and repeated submissions reuse the browser's module cache.
export const loadAuth = () =>
  import("./authService").catch((cause: unknown) => {
    throw Object.assign(
      new Error(
        "認証機能を読み込めませんでした。ページを再読み込みして、もう一度お試しください。",
      ),
      { cause },
    );
  });

export function preloadAuth() {
  // A failed preload is reported on submission, before sending an API request.
  void loadAuth().catch(() => {});
}
