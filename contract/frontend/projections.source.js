// Extracted from 3561429e55a22d400702bf5df694670c52f2e721; never edit to match the target.
const descriptions = {
    friend_request: "フレンド申請が届きました",
    friend_accepted: "フレンド申請が承認されました",
    call_invitation: "通話への招待が届きました",
    message: "新しいメッセージがあります",
    event_matched: "イベントの通話相手が決まりました",
};
function destination(n) {
    if (n.kind === "message")
        return `/message/${n.actor.id}`;
    if (n.conversation_id)
        return "/sessionlist";
    return "/friendrequest";
}
export { descriptions, destination };
export function levels(data) {
    const band = Math.max(1, Math.floor((data.length * 0.7) / 10));
    return Array.from({ length: 10 }, (_, i) => {
        let sum = 0;
        for (let j = i * band; j < (i + 1) * band; j++)
            sum += data[j];
        return Math.max(0.02, Math.min(1, sum / band / 255));
    });
}
export function speaking(data) { const average = data.reduce((acc, value) => acc + value, 0) / data.length; const volume = Math.round((average / 255) * 100); return volume > 10; }
