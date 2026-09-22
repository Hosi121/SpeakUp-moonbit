const activityEvent = "speakup:activity";

export function notifyActivity() {
  window.dispatchEvent(new Event(activityEvent));
}

export function onActivity(listener: () => void): () => void {
  window.addEventListener(activityEvent, listener);
  return () => window.removeEventListener(activityEvent, listener);
}
