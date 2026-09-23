///|
/// Each event owns precisely the identifiers needed to follow it.
pub(all) enum Notice {
  FriendRequested(@identity.UserId)
  FriendAccepted(@identity.UserId)
  CallInvitation(@identity.ConversationId)
  EventMatched(@identity.ConversationId)
  Message(@identity.UserId, @identity.MessageId)
}

///|
pub fn NotificationDto::notice(self : Self) -> Notice raise {
  let actor = @identity.UserId::from_int(self.actor.id)
  match self.kind {
    "friend_request" => FriendRequested(actor)
    "friend_accepted" => FriendAccepted(actor)
    "call_invitation" =>
      CallInvitation(@identity.ConversationId::from_int(self.conversation_id))
    "event_matched" =>
      EventMatched(@identity.ConversationId::from_int(self.conversation_id))
    "message" => Message(actor, @identity.MessageId::from_int(self.message_id))
    _ => fail("Invalid notification kind")
  }
}

///|
pub fn Notice::description(self : Self) -> String {
  match self {
    FriendRequested(_) => "フレンド申請が届きました"
    FriendAccepted(_) => "フレンド申請が承認されました"
    CallInvitation(_) => "通話への招待が届きました"
    EventMatched(_) => "イベントの通話相手が決まりました"
    Message(_, _) => "新しいメッセージがあります"
  }
}

///|
pub fn Notice::destination(self : Self) -> String {
  match self {
    FriendRequested(_) | FriendAccepted(_) => "/friendrequest"
    CallInvitation(_) | EventMatched(_) => "/sessionlist"
    Message(actor, _) => "/message/\{actor.value()}"
  }
}
