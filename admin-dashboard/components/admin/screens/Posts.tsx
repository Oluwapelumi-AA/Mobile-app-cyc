"use client";

import { useEffect, useMemo, useState } from "react";
import { api, matches, useAdmin, useChapters, useDirectory, useLiveList } from "../data";
import { useConfirm, useToast } from "../dialogs";
import { Icon } from "../icons";
import type { ApiComment, ApiPost } from "../mappers";
import {
  Avatar,
  Card,
  CardHeader,
  EmptyRow,
  LoadingRows,
  MiniStat,
  PageHeader,
  Pagination,
  RowMenu,
  SearchField,
  SelectField,
  Table,
  Td,
  Th,
  ViewAll,
  cx,
  formatDate,
  timeAgo,
  usePaged,
} from "../ui";

type PostRow = {
  id: string;
  body: string;
  authorId: string;
  chapterId: string;
  comments: number;
  createdAt: string;
  edited: boolean;
};

const mapPost = (p: ApiPost): PostRow => ({
  id: p.id,
  body: p.body,
  authorId: p.author_id,
  chapterId: p.chapter_id,
  comments: p.comment_count,
  createdAt: p.created_at,
  edited: p.edited_at !== null,
});

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/**
 * Posts live inside chapters. Platform admins and moderators can read and
 * remove posts and comments in every chapter; removals are logged and the
 * author is told.
 */
export default function Posts() {
  const { globalSearch, navigate } = useAdmin();
  const { chapters, name: chapterName } = useChapters();
  const [chapterId, setChapterId] = useState("");
  const [search, setSearch] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const { ask, dialog } = useConfirm();
  const toast = useToast();

  const activeChapters = chapters.filter((c) => c.active);
  // Start on the largest chapter; the picker is alphabetical.
  const largest = [...activeChapters].sort((a, b) => b.members - a.members)[0];
  const selectedChapter = chapterId || largest?.id || "";

  const data = useLiveList<ApiPost, PostRow>(
    selectedChapter ? `chapters/${selectedChapter}/posts?limit=50` : null,
    mapPost,
    [],
  );
  const dir = useDirectory(data.mode === "live");
  const author = (id: string) => dir.get(id)?.name ?? `User #${id.replace(/-/g, "").slice(-4).toUpperCase()}`;

  const items = data.items;
  const filtered = items.filter((p) => matches(search || globalSearch, p.body, author(p.authorId)));
  const paged = usePaged(filtered, 10);
  const preview = items.find((p) => p.id === previewId) ?? items[0] ?? null;

  const removePost = (p: PostRow) =>
    ask({
      title: "Remove post",
      message: "The post, its comments and reactions are deleted. The author is told and it goes in the audit log.",
      confirmLabel: "Remove",
      danger: true,
      onConfirm: async () => {
        try {
          await api(`posts/${p.id}`, { method: "DELETE" });
          data.setItems((rows) => rows.filter((r) => r.id !== p.id));
          toast.success("Post removed.");
        } catch (err) {
          toast.error(errorText(err, "Could not remove the post."));
        }
      },
    });

  const totalComments = items.reduce((sum, p) => sum + p.comments, 0);

  return (
    <>
      <PageHeader title="Posts and comments" subtitle="Read and moderate what members post in each chapter." />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
            <SelectField
              label="Chapter"
              value={selectedChapter}
              onChange={(value) => {
                setChapterId(value);
                setPreviewId(null);
                paged.setPage(1);
              }}
              className="col-span-2 md:w-[220px]"
              options={
                activeChapters.length
                  ? activeChapters.map((c) => ({ value: c.id, label: c.name }))
                  : [{ value: "", label: "No chapters yet" }]
              }
            />
            <SearchField className="col-span-2 md:min-w-[150px] md:flex-1" value={search} onChange={setSearch} placeholder="Search posts or authors..." />
          </div>

          {data.mode === "empty" && data.error && data.error !== "The API returned no records yet." ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{data.error}</p>
          ) : null}

          <div className="mt-4">
            <Table minWidth={720}>
              <thead>
                <tr>
                  <Th>Post</Th>
                  <Th>Author</Th>
                  <Th>Comments</Th>
                  <Th>Posted</Th>
                  <Th className="text-center">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.mode === "loading" ? <LoadingRows cols={5} /> : null}
                {paged.slice.map((p) => (
                  <tr
                    key={p.id}
                    className={cx("cursor-pointer hover:bg-canvas/40", preview?.id === p.id ? "bg-brand-soft/25" : "")}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      setPreviewId(p.id);
                    }}
                  >
                    <Td>
                      <p className="line-clamp-2 max-w-[340px] text-ink">{p.body}</p>
                      {p.edited ? <p className="text-[11px] text-muted">Edited</p> : null}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Avatar name={author(p.authorId)} size={30} />
                        <span className="whitespace-nowrap">{author(p.authorId)}</span>
                      </div>
                    </Td>
                    <Td>{p.comments}</Td>
                    <Td className="whitespace-nowrap">{timeAgo(p.createdAt)}</Td>
                    <Td className="text-center">
                      <RowMenu
                        actions={[
                          { label: "View comments", icon: "message", onSelect: () => setPreviewId(p.id) },
                          { label: "Remove post", icon: "trash", danger: true, onSelect: () => removePost(p) },
                        ]}
                      />
                    </Td>
                  </tr>
                ))}
                {data.mode !== "loading" && filtered.length === 0 ? (
                  <EmptyRow
                    cols={5}
                    title={selectedChapter ? "No posts in this chapter yet" : "No chapters yet"}
                    hint={selectedChapter ? "Members post from the CYC app." : "Create a chapter first."}
                  />
                ) : null}
              </tbody>
            </Table>
          </div>
          <Pagination page={paged.page} pages={paged.pages} onPage={paged.setPage} summary={`Showing ${paged.from}–${paged.to} of ${filtered.length} posts`} />
          {data.nextCursor ? (
            <div className="mt-3 text-center">
              <button type="button" disabled={data.loadingMore} onClick={() => void data.loadMore()} className="text-sm font-semibold text-brand hover:text-brand-dark disabled:opacity-50">
                {data.loadingMore ? "Loading…" : "Load older posts"}
              </button>
            </div>
          ) : null}
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <CardHeader title={selectedChapter ? chapterName(selectedChapter) : "Content overview"} action={<ViewAll label="Reports" onClick={() => navigate("reports")} />} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat icon="file" value={String(items.length)} label="Posts loaded" />
              <MiniStat icon="message" value={String(totalComments)} label="Comments" />
            </div>
          </Card>

          {preview ? (
            <PostPreview
              key={preview.id}
              post={preview}
              author={author}
              onRemove={() => removePost(preview)}
              onCommentRemoved={() =>
                data.setItems((rows) => rows.map((r) => (r.id === preview.id ? { ...r, comments: Math.max(0, r.comments - 1) } : r)))
              }
              onToast={toast}
            />
          ) : null}
        </div>
      </div>
      {dialog}
      {toast.element}
    </>
  );
}

function PostPreview({
  post,
  author,
  onRemove,
  onCommentRemoved,
  onToast,
}: {
  post: PostRow;
  author: (id: string) => string;
  onRemove: () => void;
  onCommentRemoved: () => void;
  onToast: { success: (text: string) => void; error: (text: string) => void };
}) {
  const [comments, setComments] = useState<ApiComment[] | null>(null);
  const [error, setError] = useState("");
  const { ask, dialog } = useConfirm();

  useEffect(() => {
    let cancelled = false;
    api<{ items: ApiComment[] }>(`posts/${post.id}/comments?limit=50`)
      .then((page) => !cancelled && setComments(page.items ?? []))
      .catch((err) => !cancelled && setError(errorText(err, "Could not load comments.")));
    return () => {
      cancelled = true;
    };
  }, [post.id]);

  const removeComment = (c: ApiComment) =>
    ask({
      title: "Remove comment",
      message: "The comment and its reactions are deleted. The author is told and it goes in the audit log.",
      confirmLabel: "Remove",
      danger: true,
      onConfirm: async () => {
        try {
          await api(`comments/${c.id}`, { method: "DELETE" });
          setComments((rows) => (rows ?? []).filter((r) => r.id !== c.id));
          onCommentRemoved();
          onToast.success("Comment removed.");
        } catch (err) {
          onToast.error(errorText(err, "Could not remove the comment."));
        }
      },
    });

  const sorted = useMemo(() => comments ?? [], [comments]);

  return (
    <Card className="p-5">
      <CardHeader title="Post" />
      <div className="mt-4 flex items-center gap-3">
        <Avatar name={author(post.authorId)} size={40} />
        <div>
          <p className="font-semibold text-ink">{author(post.authorId)}</p>
          <p className="text-xs text-muted">{formatDate(post.createdAt)}</p>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink/85">{post.body}</p>
      <button
        type="button"
        onClick={onRemove}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-soft px-3 py-2.5 text-sm font-medium text-brand hover:bg-brand-tint"
      >
        <Icon name="trash" size={17} />
        Remove post
      </button>

      <h3 className="mb-2 mt-5 font-semibold text-ink">Comments</h3>
      {error ? <p className="text-sm text-brand">{error}</p> : null}
      {comments === null && !error ? <p className="text-sm text-muted">Loading…</p> : null}
      {comments !== null && sorted.length === 0 ? <p className="text-sm text-muted">No comments yet.</p> : null}
      <ul className="space-y-3">
        {sorted.map((c) => (
          <li key={c.id} className="flex gap-3">
            <Avatar name={author(c.author_id)} size={30} />
            <div className="min-w-0 flex-1 rounded-xl bg-canvas px-3 py-2">
              <p className="text-xs font-semibold text-ink">
                {author(c.author_id)} <span className="font-normal text-muted">· {timeAgo(c.created_at)}</span>
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink/85">{c.body}</p>
            </div>
            <RowMenu actions={[{ label: "Remove comment", icon: "trash", danger: true, onSelect: () => removeComment(c) }]} />
          </li>
        ))}
      </ul>
      {dialog}
    </Card>
  );
}
