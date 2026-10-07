"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowSquareOutIcon, DotsThreeIcon, PlusIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { EMPTY_LEXICAL_STATE } from "@/components/editor/lexical-theme";
import { MarketingPostHeroUploadField } from "@/components/files/file-upload-field";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { FilterBar, matchesFilter, type FilterDefinition, type FilterState } from "@/components/filter-bar";
import {
  DetailSheet,
  DetailSheetFooter,
  EmptyState,
  ListSummary,
  RowCell,
  RowList,
  RowMenu,
  RowText,
  SheetSection,
} from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { PageHeader, StatusPill, type Tone } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useConvexForm } from "@/hooks/use-convex-form";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { useAppDialog } from "@/components/ui/app-dialog";
import { notify } from "@/lib/notify";
import { formatDate, plural } from "@/lib/format";
import {
  featuredStatPresets,
  formatPublishedAtInput,
  marketingPostFormSchema,
  marketingPostKindLabels,
  parsePublishedAtInput,
  slugifyTitle,
  type MarketingPostFormValues,
  type MarketingPostKind,
} from "@/lib/validations/marketing";
import { DatePickerField } from "@/components/ui/date-picker";

// Lexical (and its plugins) is heavy; load the editor only when a post is open.
const LexicalEditor = dynamic(
  () => import("@/components/editor/lexical-editor").then((m) => m.LexicalEditor),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted-foreground">Loading editor…</p>,
  },
);

const defaultValues: MarketingPostFormValues = {
  title: "",
  slug: "",
  excerpt: "",
  kind: "case_study",
  publishedAt: "",
  heroImageUrl: "",
  featuredStats: [],
  contentJson: EMPTY_LEXICAL_STATE,
  published: false,
  featured: false,
};

type PostStatus = "draft" | "published" | "featured";

const POST_STATUS: Record<PostStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  published: { label: "Published", tone: "emerald" },
  featured: { label: "Featured", tone: "blue" },
};

function postStatusOf(post: { published: boolean; featured: boolean }): PostStatus {
  if (!post.published) return "draft";
  return post.featured ? "featured" : "published";
}

const FILTERS: FilterDefinition[] = [
  {
    id: "status",
    label: "Status",
    options: (Object.keys(POST_STATUS) as PostStatus[]).map((value) => ({ value, label: POST_STATUS[value].label })),
  },
  {
    id: "kind",
    label: "Type",
    options: (Object.keys(marketingPostKindLabels) as MarketingPostKind[]).map((value) => ({
      value,
      label: marketingPostKindLabels[value],
    })),
  },
];

/** `?post=<id>` opens that post's editor; `?post=new` opens an empty one. */
const POST_PARAM = "post";

function setPostParam(value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(POST_PARAM, value);
  else url.searchParams.delete(POST_PARAM);
  window.history.replaceState(null, "", url);
}


export function WorkPostsManager() {
  const { confirm } = useAppDialog();
  const searchParams = useSearchParams();
  const posts = useQuery(api.marketingPosts.listAdmin, {});
  const removePost = useMutation(api.marketingPosts.remove);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  // `session` keys the editor, so it resets when another post opens but not
  // when a new post is saved and gets its id.
  const [panel, setPanel] = useState<{ id: string | null; session: number } | null>(() => {
    const param = searchParams.get(POST_PARAM);
    return param ? { id: param === "new" ? null : param, session: 0 } : null;
  });
  const dirtyRef = useRef(false);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (posts ?? []).filter(
      (post) =>
        matchesFilter(filters.status, postStatusOf(post)) &&
        matchesFilter(filters.kind, post.kind) &&
        (!needle || [post.title, post.slug, post.excerpt].some((text) => text.toLowerCase().includes(needle))),
    );
  }, [filters, posts, search]);

  const counts = rows.reduce<Record<PostStatus, number>>(
    (acc, post) => ({ ...acc, [postStatusOf(post)]: acc[postStatusOf(post)] + 1 }),
    { draft: 0, published: 0, featured: 0 },
  );
  const filterCount = (search.trim() ? 1 : 0) + Object.values(filters).filter((value) => value.values.length).length;

  function openPanel(id: string | null) {
    setPanel((current) => ({ id, session: (current?.session ?? 0) + 1 }));
    setPostParam(id ?? "new");
    dirtyRef.current = false;
  }

  function closePanel() {
    setPanel(null);
    setPostParam(null);
    dirtyRef.current = false;
  }

  async function requestClose() {
    if (dirtyRef.current) {
      const discard = await confirm({
        title: "Discard unsaved changes?",
        description: "Your edits to this post haven't been saved.",
        destructive: true,
        confirmLabel: "Discard changes",
      });
      if (!discard) return;
    }
    closePanel();
  }

  async function deletePost(post: { _id: string; title: string }) {
    const ok = await confirm({
      title: `Delete "${post.title}"?`,
      description: "The post comes off the public site and its body and images are removed. This can't be undone.",
      destructive: true,
      confirmLabel: "Delete post",
    });
    if (!ok) return false;
    try {
      await removePost({ id: post._id as Id<"marketingPosts"> });
      notify.success("Post deleted.");
      if (panel?.id === post._id) closePanel();
      return true;
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
      return false;
    }
  }

  return (
    <div className="space-y-4 pb-24" data-testid="work-posts-page">
      <PageHeader
        title="Work & stories"
        description="Case studies and blog posts on the public site. Featured posts show on the homepage."
        actions={
          <Button type="button" size="sm" onClick={() => openPanel(null)}>
            <PlusIcon />
            New post
          </Button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search title, slug, excerpt…"
        searchLabel="Search posts"
        filters={FILTERS}
        value={filters}
        onChange={setFilters}
      />

      {posts === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <ListSummary testId="work-posts-summary" order="Most recently edited first. Open a post to edit it.">
            {plural(rows.length, "post")} · {counts.published + counts.featured} published
            {counts.featured ? ` (${counts.featured} featured)` : ""} · {plural(counts.draft, "draft")}
          </ListSummary>

          {rows.length === 0 ? (
            <EmptyState
              action={
                filterCount ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setFilters({});
                    }}
                  >
                    Clear search and filters
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => openPanel(null)}>
                    New post
                  </Button>
                )
              }
            >
              {filterCount
                ? "No posts match this search and these filters."
                : "No posts yet. Write a case study about a past event, or a blog post."}
            </EmptyState>
          ) : (
            <RowList testId="work-posts-list">
              {rows.map((post) => {
                const status = POST_STATUS[postStatusOf(post)];
                return (
                  <ListRow
                    key={post._id}
                    data-testid="work-post-row"
                    onOpen={() => openPanel(post._id)}
                    actions={
                      <RowMenu label={`More for ${post.title}`}>
                        <DropdownMenuItem onSelect={() => openPanel(post._id)}>Open details</DropdownMenuItem>
                        {post.published && post.slug ? (
                          <DropdownMenuItem asChild>
                            <a href={`/work/${post.slug}`} target="_blank" rel="noopener noreferrer">
                              View on site
                              <ArrowSquareOutIcon className="size-3" aria-hidden />
                            </a>
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => void deletePost(post)}>
                          Delete post
                        </DropdownMenuItem>
                      </RowMenu>
                    }
                  >
                    <RowText
                      eyebrow={marketingPostKindLabels[post.kind]}
                      title={post.title}
                      detail={post.slug ? `/work/${post.slug}` : "No slug yet"}
                    />
                    <RowCell className="w-44" hideBelow="md" muted>
                      {post.published && post.publishedAt
                        ? formatDate(post.publishedAt)
                        : `Edited ${formatDate(post.updatedAt)}`}
                    </RowCell>
                    <span className="w-24 shrink-0">
                      <StatusPill tone={status.tone} className="h-6">
                        {status.label}
                      </StatusPill>
                    </span>
                  </ListRow>
                );
              })}
            </RowList>
          )}
        </>
      )}

      <DetailSheet
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) void requestClose();
        }}
        testId="work-post-sheet"
        className="data-[side=right]:sm:max-w-3xl"
      >
        {panel ? (
          <PostEditor
            key={panel.session}
            initialPostId={panel.id}
            onSaved={(id) => setPostParam(id)}
            onDirtyChange={(dirty) => {
              dirtyRef.current = dirty;
            }}
            onDelete={(post) => deletePost(post)}
          />
        ) : null}
      </DetailSheet>
    </div>
  );
}

function PostEditor({
  initialPostId,
  onSaved,
  onDirtyChange,
  onDelete,
}: {
  initialPostId: string | null;
  onSaved: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onDelete: (post: { _id: string; title: string }) => Promise<boolean>;
}) {
  const createPost = useMutation(api.marketingPosts.create);
  const updatePost = useMutation(api.marketingPosts.update);

  const [postId, setPostId] = useState<string | null>(initialPostId);
  const [slugTouched, setSlugTouched] = useState(Boolean(initialPostId));

  // `listAdmin` doesn't ship post bodies, so the editor loads this post's
  // `contentJson` on demand.
  const loadedPost = useQuery(
    api.marketingPosts.getById,
    postId ? { id: postId as Id<"marketingPosts"> } : "skip",
  );
  const loadedPostIdRef = useRef<string | null>(null);
  const postLoading = Boolean(postId) && loadedPost === undefined;

  const form = useConvexForm<MarketingPostFormValues>({
    schema: marketingPostFormSchema,
    defaultValues,
    mode: "onTouched",
  });

  const titleValue = form.watch("title");
  const published = form.watch("published");
  const featured = form.watch("featured");
  const isDirty = form.formState.isDirty;
  const saving = form.formState.isSubmitting;

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!slugTouched) {
      form.setValue("slug", slugifyTitle(titleValue), { shouldDirty: true });
    }
  }, [titleValue, slugTouched, form]);

  // Seed the form once per post, when its body arrives, so re-renders (and the
  // post-save reset) never clobber edits.
  useEffect(() => {
    if (!loadedPost) return;
    if (loadedPostIdRef.current === loadedPost._id) return;
    loadedPostIdRef.current = loadedPost._id;
    form.reset({
      title: loadedPost.title,
      slug: loadedPost.slug,
      excerpt: loadedPost.excerpt,
      kind: loadedPost.kind,
      publishedAt: formatPublishedAtInput(loadedPost.publishedAt),
      heroImageUrl: loadedPost.heroImageUrl,
      featuredStats: loadedPost.featuredStats ?? [],
      contentJson: loadedPost.contentJson,
      published: loadedPost.published,
      featured: loadedPost.featured,
    });
    setSlugTouched(Boolean(loadedPost.slug));
  }, [form, loadedPost]);

  // A `?post=` link to a post that no longer exists.
  if (postId && loadedPost === null) {
    return (
      <SheetHeader>
        <SheetTitle>Post not found</SheetTitle>
        <SheetDescription>It may have been deleted.</SheetDescription>
      </SheetHeader>
    );
  }

  /**
   * Saves the whole form. Header actions pass `overrides` (publish, feature),
   * so they save pending edits too rather than flipping a flag on stale data.
   */
  function save(overrides: Partial<Pick<MarketingPostFormValues, "published" | "featured">>, message: string) {
    return form.handleSubmit(
      form.submitMutation(
        async (formValues) => {
          const values = { ...formValues, ...overrides };
          if (!values.published) values.featured = false;
          const args = {
            title: values.title,
            slug: values.slug || undefined,
            excerpt: values.excerpt || undefined,
            kind: values.kind,
            publishedAt: parsePublishedAtInput(values.publishedAt),
            heroImageUrl: values.heroImageUrl || undefined,
            featuredStats: values.featuredStats,
            contentJson: values.contentJson,
            published: values.published,
            featured: values.featured,
          };
          if (postId) {
            await updatePost({ id: postId as Id<"marketingPosts">, ...args });
          } else {
            const createdId = await createPost(args);
            // The new post is already in the form; don't reseed it from the server.
            loadedPostIdRef.current = createdId;
            setPostId(createdId);
            onSaved(createdId);
          }
          return values;
        },
        {
          onSuccess: (values) => {
            form.reset(values);
            notify.success(message);
          },
        },
      ),
    )();
  }

  const status = POST_STATUS[postStatusOf({ published, featured })];
  const disabled = saving || postLoading;

  return (
    <Form {...form}>
      <form
        className="flex min-h-full flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void save({}, postId ? "Post updated." : "Post created.");
        }}
      >
        <SheetHeader className="gap-2 pr-12">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
                {postId ? "Edit post" : "New post"}
                <StatusPill tone={status.tone} className="h-6">
                  {status.label}
                </StatusPill>
              </SheetTitle>
              <SheetDescription>
                {published
                  ? "Live on the public site. Saving updates it straight away."
                  : "Only staff can see a draft. Publish it to put it on the public site."}
              </SheetDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {published ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void save({ published: false }, "Post unpublished.")}
                >
                  Unpublish
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled}
                  onClick={() => void save({ published: true }, "Post published.")}
                >
                  Publish
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon-sm" aria-label="More for this post">
                    <DotsThreeIcon weight="bold" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    disabled={disabled || !published}
                    onSelect={() =>
                      void save(
                        { featured: !featured },
                        featured ? "Removed from the homepage." : "Featured on the homepage.",
                      )
                    }
                  >
                    {featured ? "Remove from homepage" : "Feature on homepage"}
                  </DropdownMenuItem>
                  {published && loadedPost?.slug ? (
                    <DropdownMenuItem asChild>
                      <a href={`/work/${loadedPost.slug}`} target="_blank" rel="noopener noreferrer">
                        View on site
                        <ArrowSquareOutIcon className="size-3" aria-hidden />
                      </a>
                    </DropdownMenuItem>
                  ) : null}
                  {postId ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => void onDelete({ _id: postId, title: titleValue || "this post" })}
                      >
                        Delete post
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {form.saveError ? (
            <Alert>
              <AlertDescription>{form.saveError}</AlertDescription>
            </Alert>
          ) : null}
        </SheetHeader>

        {postLoading ? <p className="px-4 pb-2 text-sm text-muted-foreground">Loading post…</p> : null}

        {/* Keep the fields mounted while the body loads. Unmounting them round-trips
            the bare Type <Select> through an uncontrolled render, which writes an
            invalid `kind` into form state and makes the next save fail silently. */}
        <SheetSection title="Post">
          <div className="space-y-4">
            <TextFormField name="title" label="Title" />
            <FormField
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} onFocus={() => setSlugTouched(true)} />
                  </FormControl>
                  <p className="text-sm text-muted-foreground">Used in the public URL: /work/your-slug</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <TextareaFormField name="excerpt" label="Excerpt" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="work-post-kind">Type</Label>
                <Select
                  value={form.watch("kind")}
                  onValueChange={(value) =>
                    form.setValue("kind", value as MarketingPostFormValues["kind"], { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="work-post-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="case_study">Case study</SelectItem>
                    <SelectItem value="blog">Blog</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.watch("kind") === "case_study" ? (
                <div className="space-y-2">
                  <Label>Case study date</Label>
                  <DatePickerField
                    value={form.watch("publishedAt")}
                    onChange={(value) => form.setValue("publishedAt", value, { shouldDirty: true })}
                    placeholder="Select date"
                  />
                  <p className="text-xs text-muted-foreground">Defaults to today when you first publish.</p>
                </div>
              ) : null}
            </div>
          </div>
        </SheetSection>

        <SheetSection title="Hero image">
          <MarketingPostHeroUploadField
            postId={postId ?? undefined}
            currentUrl={form.watch("heroImageUrl") || undefined}
            urlValue={form.watch("heroImageUrl")}
            onUrlChange={(url) => form.setValue("heroImageUrl", url, { shouldDirty: true })}
            onUploaded={(storedValue) => form.setValue("heroImageUrl", storedValue, { shouldDirty: true })}
            onClear={() => form.setValue("heroImageUrl", "", { shouldDirty: true })}
          />
        </SheetSection>

        <SheetSection
          title="Featured numbers"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                form.setValue("featuredStats", [...form.getValues("featuredStats"), { label: "", value: "" }], {
                  shouldDirty: true,
                })
              }
            >
              Add stat
            </Button>
          }
        >
          <p className="text-xs text-muted-foreground">
            Highlight key facts like venue, turnout, or team size on the public page.
          </p>
          <div className="flex flex-wrap gap-2">
            {featuredStatPresets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  form.setValue("featuredStats", [...form.getValues("featuredStats"), { ...preset }], {
                    shouldDirty: true,
                  })
                }
              >
                + {preset.label}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            {form.watch("featuredStats").map((stat, index) => (
              <div key={`featured-stat-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  value={stat.label}
                  placeholder="Label (e.g. Venue)"
                  aria-label={`Stat ${index + 1} label`}
                  onChange={(event) => {
                    const next = [...form.getValues("featuredStats")];
                    next[index] = { ...next[index], label: event.target.value };
                    form.setValue("featuredStats", next, { shouldDirty: true });
                  }}
                />
                <Input
                  value={stat.value}
                  placeholder="Value (e.g. Frost Amphitheater)"
                  aria-label={`Stat ${index + 1} value`}
                  onChange={(event) => {
                    const next = [...form.getValues("featuredStats")];
                    next[index] = { ...next[index], value: event.target.value };
                    form.setValue("featuredStats", next, { shouldDirty: true });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const next = form.getValues("featuredStats").filter((_, i) => i !== index);
                    form.setValue("featuredStats", next, { shouldDirty: true });
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </SheetSection>

        <SheetSection title="Body">
          <LexicalEditor
            editorKey={postId ?? "new-post"}
            postId={postId ?? undefined}
            contentJson={form.watch("contentJson")}
            onChange={(contentJson) => form.setValue("contentJson", contentJson, { shouldDirty: true })}
          />
        </SheetSection>

        <DetailSheetFooter
          start={
            <span className="text-xs text-muted-foreground" data-testid="work-post-save-state">
              {isDirty ? "Unsaved changes" : postId ? "All changes saved" : ""}
            </span>
          }
        >
          <Button type="submit" disabled={disabled}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DetailSheetFooter>
      </form>
    </Form>
  );
}
