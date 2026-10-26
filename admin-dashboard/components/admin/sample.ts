/**
 * Sample records that mirror the approved CYC admin designs.
 * Shown only when the live API is unreachable or empty (see SAMPLE_FALLBACK).
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
export const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

export const PEOPLE = [
  "Ada Okafor",
  "James Carter",
  "Luciana Mensah",
  "Kasham Ali",
  "Tolu Adebayo",
  "Grace Williams",
  "Daniel Kim",
  "Sarah Johnson",
  "Michael Chen",
  "Fatima Bello",
];

/* ---------------- Reports ---------------- */

export type ReportRow = {
  id: string;
  title: string;
  targetType: string;
  community: string;
  reason: string;
  reporter: string;
  status: "New" | "Under review" | "Resolved" | "Dismissed";
  createdAt: string;
  details?: string;
  snippet?: string;
  reporterId?: string | null;
};

export const sampleReports: ReportRow[] = [
  { id: "r1", title: "Inappropriate comment", targetType: "Post", community: "Faith & Growth", reason: "Harassment", reporter: "User #2841", status: "New", createdAt: ago(2 * MIN), snippet: "This is not true…" },
  { id: "r2", title: "Spam link in post", targetType: "Post", community: "General", reason: "Spam", reporter: "User #1093", status: "Under review", createdAt: ago(18 * MIN), snippet: "Check this out: http://…" },
  { id: "r3", title: "Offensive language", targetType: "Comment", community: "Youth", reason: "Abuse", reporter: "User #4420", status: "Under review", createdAt: ago(1 * HOUR), snippet: "This is wrong…" },
  { id: "r4", title: "Misleading content", targetType: "Post", community: "Bible Study", reason: "Misinformation", reporter: "User #3310", status: "Resolved", createdAt: ago(3 * HOUR) },
  { id: "r5", title: "Inappropriate image", targetType: "Post", community: "General", reason: "Explicit content", reporter: "User #2217", status: "Resolved", createdAt: ago(5 * HOUR) },
  { id: "r6", title: "Hate speech", targetType: "Comment", community: "General", reason: "Hate speech", reporter: "User #1188", status: "Under review", createdAt: ago(6 * HOUR) },
  { id: "r7", title: "Self-harm content", targetType: "Post", community: "Youth", reason: "Sensitive", reporter: "User #5560", status: "New", createdAt: ago(8 * HOUR) },
  { id: "r8", title: "Copyright violation", targetType: "Post", community: "Teachings", reason: "Copyright", reporter: "User #7772", status: "Resolved", createdAt: ago(1 * DAY) },
  { id: "r9", title: "Spam account", targetType: "User profile", community: "—", reason: "Spam", reporter: "User #8821", status: "Dismissed", createdAt: ago(1 * DAY + 2 * HOUR) },
  { id: "r10", title: "Violent content", targetType: "Post", community: "General", reason: "Violence", reporter: "User #3344", status: "Under review", createdAt: ago(1 * DAY + 4 * HOUR) },
  { id: "r11", title: "Repeated spam comments", targetType: "Comment", community: "Prayer", reason: "Spam", reporter: "User #6612", status: "Resolved", createdAt: ago(2 * DAY) },
  { id: "r12", title: "Impersonating a pastor", targetType: "User profile", community: "—", reason: "Other", reporter: "User #2090", status: "Under review", createdAt: ago(2 * DAY + 3 * HOUR) },
  { id: "r13", title: "Harassing replies", targetType: "Comment", community: "Faith & Growth", reason: "Harassment", reporter: "User #1442", status: "Resolved", createdAt: ago(3 * DAY) },
  { id: "r14", title: "Fake event link", targetType: "Event", community: "Outreach", reason: "Misinformation", reporter: "User #9003", status: "Dismissed", createdAt: ago(4 * DAY) },
];

/* ---------------- Users ---------------- */

export type UserRow = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: "Member" | "Moderator" | "Admin";
  apiRole: "user" | "moderator" | "admin";
  communities: number | null;
  status: "Active" | "Muted" | "Banned" | "Pending" | "Suspended";
  emailVerified: boolean;
  joined: string;
  lastActive: string | null;
  openReports: number;
  posts?: number;
  comments?: number;
  live: boolean;
};

const userSeed: [string, UserRow["role"], number, UserRow["status"], number, number][] = [
  ["Ada Okafor", "Member", 12, "Active", 13, 2 * MIN],
  ["James Carter", "Moderator", 8, "Active", 15, 18 * MIN],
  ["Luciana Mensah", "Member", 5, "Active", 17, 1 * HOUR],
  ["Kasham Ali", "Admin", 15, "Active", 20, 2 * HOUR],
  ["Tolu Adebayo", "Member", 3, "Muted", 22, 3 * HOUR],
  ["Grace Williams", "Member", 6, "Active", 27, 5 * HOUR],
  ["Daniel Kim", "Member", 4, "Banned", 30, 1 * DAY],
  ["Sarah Johnson", "Member", 7, "Active", 35, 1 * DAY],
  ["Michael Chen", "Moderator", 9, "Active", 37, 2 * DAY],
  ["Fatima Bello", "Member", 2, "Pending", 40, 2 * DAY],
  ["Peter Obi", "Member", 3, "Active", 42, 3 * DAY],
  ["Esther Nwosu", "Member", 5, "Suspended", 45, 6 * DAY],
];

export const sampleUsers: UserRow[] = userSeed.map(([name, role, communities, status, joinedDays, last], i) => ({
  id: `u${i + 1}`,
  name,
  email: `${name.split(" ")[0].toLowerCase()}@gmail.com`,
  avatar: null,
  role,
  apiRole: role === "Member" ? "user" : (role.toLowerCase() as "moderator" | "admin"),
  communities,
  status,
  emailVerified: status !== "Pending",
  joined: ago(joinedDays * DAY),
  lastActive: ago(last),
  openReports: status === "Banned" ? 3 : status === "Muted" ? 1 : 0,
  posts: 48 - i * 3,
  comments: 236 - i * 17,
  live: false,
}));

export const sampleUserActivity = [
  { icon: "message" as const, text: "Commented on “Prayer and Fasting”", at: ago(2 * MIN) },
  { icon: "community" as const, text: "Joined department “Faith & Growth”", at: ago(1 * HOUR) },
  { icon: "badgeCheck" as const, text: "Completed course “Discipleship Foundations”", at: ago(2 * DAY) },
];

/* ---------------- Communities ---------------- */

export type CommunityRow = {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  members: number;
  posts: number | null;
  status: "Active" | "Inactive" | "Pending" | "Archived";
  createdAt: string;
};

export const sampleCommunities: CommunityRow[] = [
  { id: "c1", name: "Youth", description: "A space for young adults to grow in faith.", type: "Group", category: "Youth", members: 1245, posts: 320, status: "Active", createdAt: ago(15 * DAY) },
  { id: "c2", name: "Faith & Growth", description: "Discipleship and spiritual growth.", type: "Department", category: "Bible Study", members: 982, posts: 218, status: "Active", createdAt: ago(20 * DAY) },
  { id: "c3", name: "Prayer", description: "A department for prayer requests.", type: "Department", category: "Prayer", members: 856, posts: 410, status: "Active", createdAt: ago(24 * DAY) },
  { id: "c4", name: "Bible Study", description: "Weekly scripture discussions.", type: "Chapter", category: "Bible Study", members: 426, posts: 156, status: "Active", createdAt: ago(27 * DAY) },
  { id: "c5", name: "Music & Worship", description: "Worship and creative ministry.", type: "Department", category: "Music & Worship", members: 610, posts: 190, status: "Active", createdAt: ago(30 * DAY) },
  { id: "c6", name: "Volunteering", description: "Opportunities to serve.", type: "Department", category: "Outreach", members: 214, posts: 98, status: "Inactive", createdAt: ago(35 * DAY) },
  { id: "c7", name: "Leadership Talk", description: "Discussions on leadership.", type: "Group", category: "Leadership", members: 389, posts: 142, status: "Active", createdAt: ago(37 * DAY) },
  { id: "c8", name: "Testimonies", description: "Share and celebrate testimonies.", type: "Department", category: "Other", members: 522, posts: 276, status: "Active", createdAt: ago(40 * DAY) },
  { id: "c9", name: "Mental Health", description: "Faith, wellness and support.", type: "Department", category: "Other", members: 305, posts: 120, status: "Pending", createdAt: ago(43 * DAY) },
  { id: "c10", name: "Outreach", description: "Community outreach initiatives.", type: "Group", category: "Outreach", members: 198, posts: 84, status: "Active", createdAt: ago(45 * DAY) },
  { id: "c11", name: "Young Adults", description: "Faith in everyday life.", type: "Group", category: "Youth", members: 344, posts: 101, status: "Active", createdAt: ago(50 * DAY) },
  { id: "c12", name: "Women of Faith", description: "Fellowship and mentorship.", type: "Department", category: "Leadership", members: 276, posts: 88, status: "Inactive", createdAt: ago(55 * DAY) },
];

export const communityCategories = [
  { label: "Youth", value: 8 },
  { label: "Bible Study", value: 6 },
  { label: "Prayer", value: 5 },
  { label: "Leadership", value: 4 },
  { label: "Music & Worship", value: 4 },
  { label: "Outreach", value: 3 },
  { label: "Other", value: 6 },
];

export const sampleCommunityActivity = [
  { text: "New department “Testimonies” created", at: ago(5 * MIN) },
  { text: "25 new members joined “Youth”", at: ago(1 * HOUR) },
  { text: "Department “Volunteering” set to inactive", at: ago(3 * HOUR) },
  { text: "New post in “Faith & Growth”", at: ago(5 * HOUR) },
  { text: "Department “Mental Health” submitted for approval", at: ago(1 * DAY) },
];

/* ---------------- Posts & comments ---------------- */

export type ContentRow = {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  community: string;
  kind: "Post" | "Comment";
  status: "Active" | "Flagged" | "Under review" | "Deleted";
  createdAt: string;
  likes: number;
  comments: number;
  shares: number;
};

export const sampleContent: ContentRow[] = [
  { id: "p1", title: "How to stay consistent in prayer", excerpt: "Prayer has changed my life. Here are 5 practical ways I stay consistent in my prayer life…", author: "Ada Okafor", community: "Faith & Growth", kind: "Post", status: "Active", createdAt: ago(2 * MIN), likes: 124, comments: 36, shares: 12 },
  { id: "p2", title: "Great message from today", excerpt: "This is so encouraging!", author: "James Carter", community: "Youth", kind: "Post", status: "Flagged", createdAt: ago(18 * MIN), likes: 40, comments: 9, shares: 2 },
  { id: "p3", title: "Amen! 🙏", excerpt: "So true, this blessed me.", author: "Luciana Mensah", community: "Prayer", kind: "Comment", status: "Active", createdAt: ago(1 * HOUR), likes: 12, comments: 0, shares: 0 },
  { id: "p4", title: "Check out this resource", excerpt: "This book really helped me grow.", author: "Kasham Ali", community: "Bible Study", kind: "Post", status: "Under review", createdAt: ago(3 * HOUR), likes: 18, comments: 4, shares: 1 },
  { id: "p5", title: "What do you think about this?", excerpt: "I'd love to hear your thoughts…", author: "Tolu Adebayo", community: "General", kind: "Comment", status: "Active", createdAt: ago(5 * HOUR), likes: 6, comments: 0, shares: 0 },
  { id: "p6", title: "Amazing worship session!", excerpt: "Such a powerful time together.", author: "Grace Williams", community: "Music & Worship", kind: "Post", status: "Active", createdAt: ago(8 * HOUR), likes: 88, comments: 21, shares: 7 },
  { id: "p7", title: "Can anyone share more info?", excerpt: "I'm interested in joining.", author: "Daniel Kim", community: "General", kind: "Comment", status: "Flagged", createdAt: ago(1 * DAY), likes: 2, comments: 0, shares: 0 },
  { id: "p8", title: "Testimony: God is faithful", excerpt: "I wanted to share how God…", author: "Sarah Johnson", community: "Testimonies", kind: "Post", status: "Active", createdAt: ago(1 * DAY + HOUR), likes: 156, comments: 44, shares: 19 },
  { id: "p9", title: "This is really helpful!", excerpt: "Thank you for sharing this 🙏", author: "Michael Chen", community: "Youth", kind: "Comment", status: "Active", createdAt: ago(1 * DAY + 3 * HOUR), likes: 9, comments: 0, shares: 0 },
  { id: "p10", title: "Join our prayer circle", excerpt: "We meet every Friday at 7pm…", author: "Fatima Bello", community: "Prayer", kind: "Post", status: "Under review", createdAt: ago(2 * DAY), likes: 31, comments: 8, shares: 5 },
  { id: "p11", title: "Removed comment", excerpt: "[content removed by moderator]", author: "Peter Obi", community: "General", kind: "Comment", status: "Deleted", createdAt: ago(3 * DAY), likes: 0, comments: 0, shares: 0 },
  { id: "p12", title: "Bible reading plan for November", excerpt: "Here's the plan we'll follow as a group…", author: "Grace Williams", community: "Bible Study", kind: "Post", status: "Active", createdAt: ago(3 * DAY + 2 * HOUR), likes: 64, comments: 15, shares: 22 },
];

/* ---------------- Events ---------------- */

export type EventRow = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  category: string;
  startsAt: string;
  timezoneLabel: string;
  location: string;
  status: "Published" | "Draft" | "Scheduled" | "Cancelled" | "Completed";
  attendees: number;
  shares: number;
  ongoing?: boolean;
};

export const sampleEvents: EventRow[] = [
  { id: "e1", title: "Weekly Prayer Meeting", tagline: "Join us for a time of prayer.", description: "A weekly gathering to pray for one another, our communities and the world.", category: "Prayer", startsAt: ahead(2 * HOUR), timezoneLabel: "WAT", location: "Online", status: "Published", attendees: 214, shares: 31 },
  { id: "e2", title: "Youth Conference 2026", tagline: "Theme: Faith in Action", description: "Two days of worship, teaching and workshops for young believers.", category: "Conference", startsAt: ahead(13 * DAY), timezoneLabel: "WAT", location: "Lagos, NG", status: "Published", attendees: 1820, shares: 402 },
  { id: "e3", title: "Praise & Worship Night", tagline: "Lift your voice in worship.", description: "An evening of heartfelt worship, praise and divine connection.", category: "Worship", startsAt: ahead(15 * DAY), timezoneLabel: "WAT", location: "CYC Hall, Ikorodu", status: "Published", attendees: 642, shares: 124 },
  { id: "e4", title: "Bible Study Series", tagline: "Growing in God's Word.", description: "A four-week study through the Gospel of John.", category: "Study", startsAt: ahead(18 * DAY), timezoneLabel: "WAT", location: "Online", status: "Draft", attendees: 0, shares: 0 },
  { id: "e5", title: "Community Outreach", tagline: "Touch lives together.", description: "Serving our neighbours with food packs and prayer.", category: "Outreach", startsAt: ahead(21 * DAY), timezoneLabel: "WAT", location: "Ikorodu", status: "Published", attendees: 156, shares: 48 },
  { id: "e6", title: "Gospel Concert", tagline: "Music. Worship. Hope.", description: "Live gospel music featuring CYC choirs.", category: "Music", startsAt: ahead(28 * DAY), timezoneLabel: "WAT", location: "CYC Hall", status: "Scheduled", attendees: 380, shares: 90 },
  { id: "e7", title: "Sunday Fellowship", tagline: "Worship together.", description: "Our weekly fellowship service.", category: "Worship", startsAt: ago(30 * MIN), timezoneLabel: "WAT", location: "CYC Hall", status: "Published", attendees: 510, shares: 64, ongoing: true },
  { id: "e8", title: "Leaders' Retreat", tagline: "Rest and renewal.", description: "A weekend retreat for community leaders.", category: "Conference", startsAt: ago(1 * HOUR), timezoneLabel: "WAT", location: "Epe Resort", status: "Published", attendees: 72, shares: 10, ongoing: true },
  { id: "e9", title: "Bible Study Series (Part 1)", tagline: "Foundations.", description: "Part one of the series.", category: "Study", startsAt: ago(10 * DAY), timezoneLabel: "WAT", location: "Online", status: "Completed", attendees: 288, shares: 40 },
  { id: "e10", title: "Prayer & Fasting Week", tagline: "Seeking God together.", description: "A week of corporate prayer and fasting.", category: "Prayer", startsAt: ago(20 * DAY), timezoneLabel: "WAT", location: "Online", status: "Completed", attendees: 940, shares: 155 },
];

/* ---------------- Live & video ---------------- */

export type VideoRow = {
  id: string;
  title: string;
  subtitle: string;
  kind: "Live" | "Video";
  host: string;
  community: string;
  status: "Live now" | "Published" | "Ended" | "Draft" | "Scheduled";
  date: string;
  views: number | null;
  duration: string;
  watching?: number;
  likes?: number;
  comments?: number;
};

export const sampleVideos: VideoRow[] = [
  { id: "v1", title: "Sunday Worship Live", subtitle: "A time of worship and the word", kind: "Live", host: "Pastor Daniel", community: "CYC Global", status: "Live now", date: ago(40 * MIN), views: 1200, duration: "1:24:30", watching: 1245, likes: 320, comments: 86 },
  { id: "v2", title: "Bible Study: John 3", subtitle: "Understanding new birth", kind: "Video", host: "Grace Williams", community: "Bible Study", status: "Published", date: ago(2 * DAY), views: 842, duration: "48:15" },
  { id: "v3", title: "Prayer Night", subtitle: "An evening of intercession", kind: "Live", host: "Kasham Ali", community: "Prayer", status: "Ended", date: ago(5 * DAY), views: 2100, duration: "1:05:20" },
  { id: "v4", title: "Faith & Growth Talk", subtitle: "Practical steps for spiritual growth", kind: "Video", host: "James Carter", community: "Faith & Growth", status: "Published", date: ago(7 * DAY), views: 960, duration: "56:10" },
  { id: "v5", title: "Youth Q&A Session", subtitle: "Real questions, honest answers", kind: "Live", host: "Luciana Mensah", community: "Youth", status: "Ended", date: ago(9 * DAY), views: 1400, duration: "1:12:05" },
  { id: "v6", title: "Worship Moments", subtitle: "Songs and spontaneous worship", kind: "Video", host: "Tolu Adebayo", community: "Music & Worship", status: "Published", date: ago(12 * DAY), views: 670, duration: "42:30" },
  { id: "v7", title: "Leadership Webinar", subtitle: "Leading with purpose", kind: "Video", host: "Michael Chen", community: "Leadership", status: "Published", date: ago(15 * DAY), views: 520, duration: "38:22" },
  { id: "v8", title: "Testimony Night", subtitle: "Stories of God's faithfulness", kind: "Live", host: "Fatima Bello", community: "General", status: "Ended", date: ago(17 * DAY), views: 1800, duration: "1:18:13" },
  { id: "v9", title: "Young Adults Discussion", subtitle: "Faith in everyday life", kind: "Video", host: "Ada Okafor", community: "Young Adults", status: "Draft", date: ago(19 * DAY), views: null, duration: "50:40" },
  { id: "v10", title: "How to Study the Bible", subtitle: "A practical guide", kind: "Video", host: "Daniel Kim", community: "Bible Study", status: "Published", date: ago(22 * DAY), views: 690, duration: "29:10" },
  { id: "v11", title: "Midweek Service", subtitle: "Teaching and prayer", kind: "Live", host: "Pastor Daniel", community: "CYC Global", status: "Scheduled", date: ahead(3 * DAY), views: null, duration: "—" },
];

/* ---------------- Spiritual resources ---------------- */

export type ResourceRow = {
  id: string;
  title: string;
  summary: string;
  type: "Sermon" | "Devotional" | "Bible Study" | "Article" | "Other";
  author: string;
  category: string;
  status: "Published" | "Draft" | "Archived";
  views: number | null;
  date: string;
  downloads?: number;
  comments?: number;
  likes?: number;
};

export const sampleResources: ResourceRow[] = [
  { id: "res1", title: "Walking in Faith", summary: "Understanding what it means to live by faith in everyday life. In this message, we explore key scriptures and practical steps to grow in faith.", type: "Sermon", author: "Pastor Daniel", category: "Faith", status: "Published", views: 2400, date: ago(1 * DAY), downloads: 520, comments: 86, likes: 312 },
  { id: "res2", title: "The Book of John", summary: "A deep dive into the life and teachings of Jesus.", type: "Bible Study", author: "Grace Williams", category: "Bible Study", status: "Published", views: 1800, date: ago(3 * DAY) },
  { id: "res3", title: "Daily Devotional", summary: "God's grace for today.", type: "Devotional", author: "Ada Okafor", category: "Devotional", status: "Published", views: 3200, date: ago(4 * DAY) },
  { id: "res4", title: "Prayer Guide", summary: "A practical guide to a more consistent prayer life.", type: "Article", author: "James Carter", category: "Prayer", status: "Published", views: 1100, date: ago(6 * DAY) },
  { id: "res5", title: "Worship and Adoration", summary: "The heart of true worship.", type: "Sermon", author: "Tolu Adebayo", category: "Worship", status: "Published", views: 2600, date: ago(8 * DAY) },
  { id: "res6", title: "Spiritual Growth Plan", summary: "Steps to grow deeper in your relationship with God.", type: "Article", author: "Sarah Johnson", category: "Growth", status: "Draft", views: null, date: ago(10 * DAY) },
  { id: "res7", title: "Youth Bible Study", summary: "Foundations for a strong spiritual life.", type: "Bible Study", author: "Michael Chen", category: "Youth", status: "Published", views: 1900, date: ago(13 * DAY) },
  { id: "res8", title: "Overcoming Anxiety", summary: "Finding peace in God's word.", type: "Devotional", author: "Fatima Bello", category: "Mental Health", status: "Published", views: 2100, date: ago(16 * DAY) },
  { id: "res9", title: "Christian Living", summary: "Practical steps for daily living.", type: "Article", author: "Daniel Kim", category: "General", status: "Archived", views: 890, date: ago(18 * DAY) },
  { id: "res10", title: "The Power of Prayer", summary: "How prayer changes things.", type: "Sermon", author: "Luciana Mensah", category: "Prayer", status: "Published", views: 3400, date: ago(20 * DAY) },
  { id: "res11", title: "Church history primer", summary: "From the early church to today.", type: "Other", author: "Kasham Ali", category: "General", status: "Published", views: 410, date: ago(25 * DAY) },
];

/* ---------------- Courses ---------------- */

export type CourseRow = {
  id: string;
  title: string;
  summary: string;
  instructor: string;
  category: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  lessons: number;
  students: number;
  status: "Published" | "Draft";
};

export const sampleCourses: CourseRow[] = [
  { id: "co1", title: "Growing in Faith", summary: "A deeper walk with God in everyday life.", instructor: "Pastor Daniel", category: "Faith", level: "Beginner", lessons: 12, students: 1400, status: "Published" },
  { id: "co2", title: "Understanding the Bible", summary: "Key teachings and practical applications.", instructor: "Grace Williams", category: "Bible Study", level: "Intermediate", lessons: 18, students: 892, status: "Published" },
  { id: "co3", title: "Prayer and Intercession", summary: "Learn how to pray effectively and see results.", instructor: "Tolu Adebayo", category: "Prayer", level: "Beginner", lessons: 10, students: 2100, status: "Published" },
  { id: "co4", title: "Youth Discipleship", summary: "Building a strong foundation as a young Christian.", instructor: "Ada Okafor", category: "Youth", level: "Beginner", lessons: 14, students: 1200, status: "Draft" },
  { id: "co5", title: "Worship and Adoration", summary: "The heart and lifestyle of true worship.", instructor: "Michael Chen", category: "Worship", level: "Intermediate", lessons: 16, students: 980, status: "Published" },
  { id: "co6", title: "Christian Living", summary: "Practical steps for daily living.", instructor: "Sarah Johnson", category: "Christian Life", level: "Beginner", lessons: 8, students: 760, status: "Published" },
  { id: "co7", title: "Leadership in Ministry", summary: "Equip, inspire and lead with purpose.", instructor: "James Carter", category: "Leadership", level: "Advanced", lessons: 20, students: 540, status: "Published" },
  { id: "co8", title: "Faith and Mental Health", summary: "Finding balance and peace in Christ.", instructor: "Fatima Bello", category: "Mental Health", level: "Intermediate", lessons: 12, students: 1100, status: "Published" },
  { id: "co9", title: "Christian Relationships", summary: "Building godly and healthy relationships.", instructor: "Daniel Kim", category: "Relationships", level: "Beginner", lessons: 9, students: 720, status: "Draft" },
  { id: "co10", title: "The Life of Jesus", summary: "A journey through the Gospels.", instructor: "Luciana Mensah", category: "Bible Study", level: "Intermediate", lessons: 15, students: 1800, status: "Published" },
  { id: "co11", title: "Evangelism Basics", summary: "Sharing your faith with confidence.", instructor: "Kasham Ali", category: "Outreach", level: "Beginner", lessons: 7, students: 430, status: "Draft" },
];

export const sampleQuizAttempts = [
  { student: "John Doe", quiz: "Lesson 3 Quiz", score: 90, at: ago(1 * DAY) },
  { student: "Grace A.", quiz: "Final Assessment", score: 75, at: ago(2 * DAY) },
  { student: "Tolu A.", quiz: "Lesson 1 Quiz", score: 100, at: ago(3 * DAY) },
  { student: "Sarah J.", quiz: "Module 2 Quiz", score: 60, at: ago(4 * DAY) },
];

/* ---------------- Branches ---------------- */

export type BranchRow = {
  id: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  members: number;
  communities: number;
  contact: string;
  active: boolean;
  createdAt: string;
};

export const sampleBranches: BranchRow[] = [
  { id: "b1", name: "CYC Ikorodu", city: "Ikorodu", country: "NG", timezone: "Africa/Lagos", members: 1240, communities: 12, contact: "ikorodu@cyc.org", active: true, createdAt: ago(400 * DAY) },
  { id: "b2", name: "CYC Lagos Island", city: "Lagos", country: "NG", timezone: "Africa/Lagos", members: 860, communities: 8, contact: "lagos@cyc.org", active: true, createdAt: ago(320 * DAY) },
  { id: "b3", name: "CYC Abuja", city: "Abuja", country: "NG", timezone: "Africa/Lagos", members: 512, communities: 6, contact: "abuja@cyc.org", active: true, createdAt: ago(260 * DAY) },
  { id: "b4", name: "CYC Accra", city: "Accra", country: "GH", timezone: "Africa/Accra", members: 298, communities: 4, contact: "accra@cyc.org", active: true, createdAt: ago(190 * DAY) },
  { id: "b5", name: "CYC London", city: "London", country: "GB", timezone: "Europe/London", members: 184, communities: 3, contact: "london@cyc.org", active: true, createdAt: ago(120 * DAY) },
  { id: "b6", name: "CYC Houston", city: "Houston", country: "US", timezone: "America/Chicago", members: 96, communities: 2, contact: "houston@cyc.org", active: false, createdAt: ago(80 * DAY) },
];

/* ---------------- Notifications ---------------- */

export type NotificationRow = {
  id: string;
  title: string;
  body: string;
  type: "Live" | "Course" | "Department" | "Event" | "Security" | "Resource" | "System" | "Newsletter" | "Update";
  audience: string;
  status: "Sent" | "Scheduled" | "Draft";
  createdBy: string;
  date: string;
};

export const sampleNotifications: NotificationRow[] = [
  { id: "n1", title: "Upcoming Live Session", body: "Join us for Sunday Worship Live tomorrow at 10 AM.", type: "Live", audience: "All users", status: "Sent", createdBy: "Daniel Kim", date: ago(1 * DAY) },
  { id: "n2", title: "New Course Available", body: "Our new course “Growing in Faith” is now live!", type: "Course", audience: "All users", status: "Sent", createdBy: "Grace Williams", date: ago(3 * DAY) },
  { id: "n3", title: "Department Update", body: "New discussions in your departments.", type: "Department", audience: "Department members", status: "Scheduled", createdBy: "James Carter", date: ahead(1 * DAY) },
  { id: "n4", title: "Event Reminder", body: "Don't forget! Prayer Night starts in 1 hour.", type: "Event", audience: "Registered attendees", status: "Sent", createdBy: "Fatima Bello", date: ago(5 * DAY) },
  { id: "n5", title: "Account Security", body: "We noticed a new login to your account.", type: "Security", audience: "Specific users", status: "Sent", createdBy: "System", date: ago(7 * DAY) },
  { id: "n6", title: "New Sermon Published", body: "Check out this week's sermon: The Power of Prayer.", type: "Resource", audience: "All users", status: "Sent", createdBy: "Tolu Adebayo", date: ago(9 * DAY) },
  { id: "n7", title: "Quiz Result Available", body: "Your quiz result for Lesson 3 is now available.", type: "Course", audience: "Students", status: "Sent", createdBy: "Ada Okafor", date: ago(11 * DAY) },
  { id: "n8", title: "Community Guidelines", body: "Please review our updated community guidelines.", type: "System", audience: "All users", status: "Draft", createdBy: "Michael Chen", date: ago(12 * DAY) },
  { id: "n9", title: "Monthly Newsletter", body: "Here's what happened this month at CYC.", type: "Newsletter", audience: "All users", status: "Sent", createdBy: "Sarah Johnson", date: ago(15 * DAY) },
  { id: "n10", title: "Feature Update", body: "New features are now available on the platform.", type: "Update", audience: "All users", status: "Scheduled", createdBy: "Luciana Mensah", date: ahead(3 * DAY) },
  { id: "n11", title: "Youth Conference registration", body: "Registration for Youth Conference 2026 is open.", type: "Event", audience: "Youth", status: "Sent", createdBy: "Kasham Ali", date: ago(16 * DAY) },
];

/* ---------------- Audit log ---------------- */

export type AuditRow = {
  id: string;
  at: string;
  actor: string;
  actorRole: string;
  action: string;
  module: string;
  details: string;
  ip: string;
  status: "Success" | "Failed";
  category: "admin" | "user" | "system" | "content";
  actorId?: string | null;
};

export const sampleAudit: AuditRow[] = [
  { id: "a1", at: ago(20 * MIN), actor: "Daniel Kim", actorRole: "Admin", action: "Updated", module: "User", details: "Updated user role for john.doe@example.com to Moderator", ip: "192.168.1.24", status: "Success", category: "admin" },
  { id: "a2", at: ago(1 * HOUR + 5 * MIN), actor: "Grace Williams", actorRole: "Admin", action: "Deleted", module: "Comment", details: "Deleted an inappropriate comment (ID: #48291)", ip: "192.168.1.24", status: "Success", category: "content" },
  { id: "a3", at: ago(20 * HOUR), actor: "Tolu Adebayo", actorRole: "Moderator", action: "Approved", module: "Post", details: "Approved post (ID: #48210)", ip: "192.168.1.18", status: "Success", category: "content" },
  { id: "a4", at: ago(22 * HOUR), actor: "Ada Okafor", actorRole: "Admin", action: "Created", module: "Event", details: "Created new event “Prayer Night” (ID: #201)", ip: "192.168.1.24", status: "Success", category: "admin" },
  { id: "a5", at: ago(2 * DAY), actor: "James Carter", actorRole: "Admin", action: "Published", module: "Resource", details: "Published sermon “The Power of Prayer”", ip: "192.168.1.16", status: "Success", category: "content" },
  { id: "a6", at: ago(3 * DAY), actor: "Sarah Johnson", actorRole: "Admin", action: "Updated", module: "Course", details: "Updated course details ‘Christian Living’", ip: "192.168.1.24", status: "Success", category: "admin" },
  { id: "a7", at: ago(3 * DAY + 5 * HOUR), actor: "Michael Chen", actorRole: "System", action: "System", module: "System", details: "User login from new device (john.doe@gmail.com)", ip: "192.168.1.30", status: "Success", category: "system" },
  { id: "a8", at: ago(4 * DAY), actor: "Fatima Bello", actorRole: "Admin", action: "Suspended", module: "User", details: "Suspended user (ID: #1092) for violation", ip: "192.168.1.24", status: "Success", category: "admin" },
  { id: "a9", at: ago(5 * DAY), actor: "Luciana Mensah", actorRole: "Moderator", action: "Edited", module: "Department", details: "Updated department details “Youth”", ip: "192.168.1.18", status: "Success", category: "content" },
  { id: "a10", at: ago(6 * DAY), actor: "System", actorRole: "System", action: "Login", module: "Auth", details: "Successful login (admin@cyc.org)", ip: "192.168.1.12", status: "Success", category: "system" },
  { id: "a11", at: ago(6 * DAY + 2 * HOUR), actor: "Peter Obi", actorRole: "Member", action: "Login", module: "Auth", details: "Failed login attempt (wrong password)", ip: "10.0.0.41", status: "Failed", category: "user" },
  { id: "a12", at: ago(7 * DAY), actor: "Esther Nwosu", actorRole: "Member", action: "Created", module: "Post", details: "Created post in “Prayer”", ip: "10.0.0.17", status: "Success", category: "user" },
];

/* ---------------- Overview chart ---------------- */

/** 30 days of activity (posts, comments, new users) — sample curve. */
export const sampleActivitySeries = (() => {
  const posts = [20, 32, 45, 60, 52, 66, 78, 70, 90, 140, 118, 84, 70, 92, 108, 82, 76, 96, 110, 84, 96, 112, 130, 120, 104, 126, 150, 140, 170, 192];
  const comments = [5, 14, 22, 28, 24, 30, 36, 42, 50, 64, 82, 70, 54, 58, 74, 62, 50, 58, 72, 60, 64, 72, 80, 76, 70, 84, 96, 92, 104, 116];
  const users = [2, 4, 6, 8, 7, 9, 10, 9, 12, 14, 13, 11, 10, 12, 14, 12, 10, 12, 14, 12, 13, 15, 16, 15, 14, 16, 18, 17, 19, 22];
  return { posts, comments, users };
})();
