// Extracted verbatim from the pinned SpeakUp source. Runtime oracle only.
export const mapEventDto = (dto: EventDto): Event => ({
  id: dto.id,
  eventStart: dto.event_start,
  eventEnd: dto.event_end,
  themeId: dto.theme_id,
  theme: {
    themeText: dto.theme.theme_text,
    topic1: dto.theme.topic1,
    topic2: dto.theme.topic2,
    topic3: dto.theme.topic3,
  },
});

export const mapUserDto = (dto: UserDto): User => ({
  id: dto.id,
  username: dto.username,
  avatarUrl: dto.avatar_url,
  email: dto.email,
  createdAt: dto.created_at,
});

export const mapUserProfileDto = (dto: UserProfileDto): UserProfile => ({
  id: dto.id,
  username: dto.username,
  email: dto.email,
  avatarUrl: dto.avatar_url,
  role: dto.role,
  createdAt: dto.created_at,
  updatedAt: dto.updated_at,
});

export const mapFriendSummaryDto = (dto: FriendSummaryDto): FriendSummary => ({
  id: dto.id,
  username: dto.username,
  avatarUrl: dto.avatar_url,
});

export const fromMemoDto = (dto: MemoDto): UserNotes => ({
  carryInMemo: dto.memo1 ?? "",
  wordList: dto.memo2 ?? "",
});

export const toMemoDto = (notes: UserNotes): MemoDto => ({
  memo1: notes.carryInMemo,
  memo2: notes.wordList,
});

export const mapSessionDto = (dto: SessionDto): SessionData => ({
  theme: dto.theme,
  dateTime: dto.date_time,
  sessions: dto.sessions,
});

export const mapConversationHistoryDto = (
  dto: ConversationHistoryDto
): ConversationHistoryItem => ({
  date: dto.date,
  previousDate: dto.previous_date,
  sessions: dto.sessions,
  completionRate: dto.completion_rate,
  comment: dto.comment,
  examples: dto.examples.map((example) => ({
    english: example.english,
    japanese: example.japanese,
  })),
});