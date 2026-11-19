/** Shapes returned by the CYC API (see /docs on the running server). */

export type Page<T> = { items: T[]; next_cursor: string | null };

export type User = {
  id: string;
  email: string;
  is_active: boolean;
  is_verified: boolean;
  account_role: "admin" | "moderator" | "user";
  created_at: string;
};

export type Profile = {
  user_id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  language_code: string | null;
  country_code: string | null;
  city: string | null;
  timezone: string | null;
  preferred_chapter_id: string | null;
  chapter_id: string | null;
  department_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicProfile = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  membership_status: "guest" | "member";
  chapter_id: string | null;
  chapter_name: string | null;
  department_name: string | null;
  is_deleted: boolean;
  member_since: string;
};

export type Membership = {
  membership_status: "guest" | "member";
  chapter_id: string | null;
  chapter_name: string | null;
  preferred_chapter_id: string | null;
  department_id: string | null;
  department_name: string | null;
  onboarding_complete: boolean;
};

export type OnboardingStep = "profile_basics" | "avatar" | "language" | "region" | "timezone" | "chapter";

export type OnboardingStatus = {
  steps: { step: OnboardingStep; required: boolean; status: "pending" | "completed" | "skipped" }[];
  next_step: OnboardingStep | null;
  required_remaining: OnboardingStep[];
  can_complete: boolean;
  is_complete: boolean;
  completed_at: string | null;
};

export type Chapter = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  country_code: string;
  city: string | null;
  timezone: string;
  language_code: string | null;
  contact_email: string | null;
  is_active: boolean;
  member_count: number;
  is_mine: boolean;
  my_role: string | null;
};

export type Staff = {
  id: string;
  chapter_id: string;
  user_id: string;
  role: "coordinator";
  email: string;
  display_name: string | null;
};

export type Department = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
};

export type EventItem = {
  id: string;
  chapter_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  online_url: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  capacity: number | null;
  status: "scheduled" | "cancelled";
  registered_count: number;
  waitlist_count: number;
  spots_left: number | null;
  my_registration: "registered" | "waitlisted" | null;
};

export type Meeting = {
  id: string;
  kind: "meeting" | "livestream";
  chapter_id: string | null;
  event_id: string | null;
  title: string;
  description: string | null;
  status: "scheduled" | "live" | "ended" | "cancelled";
  scheduled_start_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  can_join: boolean;
};

export type JoinToken = {
  meeting_id: string;
  provider: string;
  room_id: string;
  role: string;
  token: string;
  server_url: string;
  expires_at: string;
};

export type Progress = {
  resource_id: string;
  percent: number;
  position_seconds: number | null;
  completed: boolean;
};

export type ResourceKind = "article" | "audio" | "video" | "document" | "link";

export type Resource = {
  id: string;
  chapter_id: string | null;
  category_id: string | null;
  kind: ResourceKind;
  title: string;
  summary: string | null;
  author_name: string | null;
  scripture_reference: string | null;
  language: string | null;
  external_url: string | null;
  has_file: boolean;
  file_content_type: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  published_at: string | null;
  bookmarked: boolean;
  my_progress: Progress | null;
  created_at: string;
};

export type ResourceDetail = Resource & {
  body: string | null;
  file_url: string | null;
  file_url_expires_at: string | null;
};

export type Category = { id: string; slug: string; name: string; description: string | null; sort_order: number };

export type Course = {
  id: string;
  chapter_id: string | null;
  title: string;
  summary: string | null;
  category: string | null;
  level: "beginner" | "intermediate" | "advanced";
  instructor_name: string | null;
  lesson_count: number;
  quiz_count: number;
  student_count: number;
  enrolled: boolean;
  completed_at: string | null;
};

export type Lesson = {
  id: string;
  course_id: string;
  position: number;
  title: string;
  body: string | null;
  video_url: string | null;
  duration_minutes: number | null;
  completed: boolean;
};

export type Quiz = {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  pass_mark: number;
  question_count: number;
  questions: { prompt: string; options: string[]; correct_index: number | null }[];
  attempt_count: number;
  my_best_score: number | null;
};

export type CourseDetail = Course & { description: string | null; lessons: Lesson[]; quizzes: Quiz[] };

export type QuizAttempt = {
  id: string;
  quiz_id: string;
  score: number;
  passed: boolean;
  correct_count: number;
  question_count: number;
  created_at: string;
};

export type Certificate = { course_id: string; course_title: string; best_score: number | null; completed_at: string };

export type Post = {
  id: string;
  chapter_id: string;
  author_id: string;
  body: string;
  comment_count: number;
  created_at: string;
  edited_at: string | null;
};

export type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type SearchType = "chapters" | "people" | "posts" | "events" | "resources";

export type SearchHit = {
  type: SearchType;
  id: string;
  title: string;
  snippet: string | null;
  chapter_id: string | null;
  image_url: string | null;
  starts_at: string | null;
  created_at: string;
};

export type SearchOverview = { query: string } & Record<SearchType, SearchHit[]>;

export type NotificationCategory = "social" | "chapter" | "events" | "meetings" | "resources";

export type AppNotification = {
  id: string;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
};

export type Preference = { category: NotificationCategory; push: boolean; email: boolean };

export type Home = {
  membership: Membership;
  unread_notifications: number;
  live_now: Meeting[];
  upcoming_events: EventItem[];
  recent_posts: Post[];
  new_resources: Resource[];
  continue_learning: Course[];
};
