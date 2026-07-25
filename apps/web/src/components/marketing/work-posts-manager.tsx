"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { EMPTY_LEXICAL_STATE } from "@/components/editor/lexical-theme";
import { MarketingPostHeroUploadField } from "@/components/files/file-upload-field";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConvexForm } from "@/hooks/use-convex-form";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  featuredStatPresets,
  formatPublishedAtInput,
  marketingPostFormSchema,
  marketingPostKindLabels,
  parsePublishedAtInput,
  slugifyTitle,
  type MarketingPostFormValues,
} from "@/lib/validations/marketing";
import { cn } from "@/lib/utils";
import { DatePickerField } from "@/components/ui/date-picker";

// Lexical (and its plugins) is heavy; load the editor only when this manager renders.
const LexicalEditor = dynamic(
  () => import("@/components/editor/lexical-editor").then((m) => m.LexicalEditor),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted-foreground">Loading editor...</p>,
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

function StatusBadge({ published, featured }: { published: boolean; featured: boolean }) {
  if (!published) {
    return (
      <span className="rounded-none border px-2 py-0.5 text-xs text-muted-foreground">Draft</span>
    );
  }
  return (
    <span className="rounded-none border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">
      {featured ? "Published · Featured" : "Published"}
    </span>
  );
}

export function WorkPostsManager() {
  const posts = useQuery(api.marketingPosts.listAdmin, {});
  const createPost = useMutation(api.marketingPosts.create);
  const updatePost = useMutation(api.marketingPosts.update);
  const removePost = useMutation(api.marketingPosts.remove);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  // `listAdmin` no longer ships every post body, so the editor loads the
  // selected post's `contentJson` on demand.
  const selectedPost = useQuery(
    api.marketingPosts.getById,
    selectedId ? { id: selectedId as Id<"marketingPosts"> } : "skip",
  );
  const loadedPostIdRef = useRef<string | null>(null);
  const postLoading = Boolean(selectedId) && selectedPost === undefined;

  type AdminPost = NonNullable<typeof selectedPost>;

  const form = useConvexForm<MarketingPostFormValues>({
    schema: marketingPostFormSchema,
    defaultValues,
    mode: "onTouched",
  });

  const titleValue = form.watch("title");

  useEffect(() => {
    if (!slugTouched) {
      form.setValue("slug", slugifyTitle(titleValue), { shouldDirty: true });
    }
  }, [titleValue, slugTouched, form]);

  const resetToPost = (post: AdminPost) => {
    form.reset({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      kind: post.kind,
      publishedAt: formatPublishedAtInput(post.publishedAt),
      heroImageUrl: post.heroImageUrl,
      featuredStats: post.featuredStats ?? [],
      contentJson: post.contentJson,
      published: post.published,
      featured: post.featured,
    });
    setSlugTouched(Boolean(post.slug));
  };

  // Seed the form once per selected post, when its body arrives. Keyed on the
  // loaded id so re-renders (and the post-save reset) never clobber edits.
  useEffect(() => {
    if (!selectedPost) return;
    if (loadedPostIdRef.current === selectedPost._id) return;
    loadedPostIdRef.current = selectedPost._id;
    resetToPost(selectedPost);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPost]);

  const startNewPost = () => {
    setSelectedId(null);
    loadedPostIdRef.current = null;
    setSlugTouched(false);
    form.reset(defaultValues);
  };

  const selectPost = (id: string) => {
    setSelectedId(id);
    setSlugTouched(true);
  };

  const onSave = form.submitMutation(
    async (values) => {
      const publishedAt = parsePublishedAtInput(values.publishedAt);
      if (selectedId) {
        await updatePost({
          id: selectedId as Id<"marketingPosts">,
          title: values.title,
          slug: values.slug || undefined,
          excerpt: values.excerpt || undefined,
          kind: values.kind,
          publishedAt,
          heroImageUrl: values.heroImageUrl || undefined,
          featuredStats: values.featuredStats,
          contentJson: values.contentJson,
          published: values.published,
          featured: values.featured,
        });
        return values;
      }

      const createdId = await createPost({
        title: values.title,
        slug: values.slug || undefined,
        excerpt: values.excerpt || undefined,
        kind: values.kind,
        publishedAt,
        heroImageUrl: values.heroImageUrl || undefined,
        featuredStats: values.featuredStats,
        contentJson: values.contentJson,
        published: values.published,
        featured: values.featured,
      });
      setSelectedId(createdId);
      setSlugTouched(Boolean(values.slug));
      return values;
    },
    {
      onSuccess: (values) => {
        form.reset(values);
        setMessage(selectedId ? "Post updated." : "Post created.");
      },
    },
  );

  async function onDelete() {
    if (!selectedId) return;
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try {
      await removePost({ id: selectedId as Id<"marketingPosts"> });
      startNewPost();
      setMessage("Post deleted.");
    } catch (error) {
      setMessage(getConvexErrorMessage(error));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Posts</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={startNewPost}>
            New
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {posts === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : null}
          {posts && posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No posts yet.</p>
          ) : null}
          {posts?.map((post) => (
            <button
              key={post._id}
              type="button"
              onClick={() => selectPost(post._id)}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50",
                selectedId === post._id && "border-primary bg-muted/40",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug">{post.title}</p>
                <StatusBadge published={post.published} featured={post.featured} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {marketingPostKindLabels[post.kind]}
                {post.slug ? ` · /work/${post.slug}` : ""}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selectedId ? "Edit post" : "New post"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {message || form.saveError ? (
            <Alert className="mb-4">
              <AlertDescription>{message ?? form.saveError}</AlertDescription>
            </Alert>
          ) : null}

          {postLoading ? (
            <p className="mb-4 text-sm text-muted-foreground">Loading post…</p>
          ) : null}

          {/* Keep the form mounted while the body loads. Unmounting it round-trips
              the bare Type <Select> through an uncontrolled render, which writes an
              invalid `kind` into form state and makes the next save fail silently. */}
          <Form {...form}>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSave)}>
              <TextFormField name="title" label="Title" />
              <FormField
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        onFocus={() => setSlugTouched(true)}
                      />
                    </FormControl>
                    <p className="text-sm text-muted-foreground">
                      Used in the public URL: /work/your-slug
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <TextareaFormField name="excerpt" label="Excerpt" />

              {form.watch("kind") === "case_study" ? (
                <div className="space-y-2">
                  <Label>Case study date</Label>
                  <DatePickerField
                    value={form.watch("publishedAt")}
                    onChange={(value) =>
                      form.setValue("publishedAt", value, { shouldDirty: true })
                    }
                    placeholder="Select date"
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown on the public case study page. Defaults to today when you first publish.
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.watch("kind")}
                  onValueChange={(value) =>
                    form.setValue("kind", value as MarketingPostFormValues["kind"], {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="case_study">Case study</SelectItem>
                    <SelectItem value="blog">Blog</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.watch("published")}
                    onChange={(event) =>
                      form.setValue("published", event.target.checked, { shouldDirty: true })
                    }
                  />
                  Published
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.watch("featured")}
                    disabled={!form.watch("published")}
                    onChange={(event) =>
                      form.setValue("featured", event.target.checked, { shouldDirty: true })
                    }
                  />
                  Featured on homepage
                </label>
              </div>

              <MarketingPostHeroUploadField
                postId={selectedId ?? undefined}
                currentUrl={form.watch("heroImageUrl") || undefined}
                urlValue={form.watch("heroImageUrl")}
                onUrlChange={(url) => form.setValue("heroImageUrl", url, { shouldDirty: true })}
                onUploaded={(storedValue) =>
                  form.setValue("heroImageUrl", storedValue, { shouldDirty: true })
                }
                onClear={() => form.setValue("heroImageUrl", "", { shouldDirty: true })}
              />

              <div className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Featured numbers</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      form.setValue(
                        "featuredStats",
                        [...form.getValues("featuredStats"), { label: "", value: "" }],
                        { shouldDirty: true },
                      )
                    }
                  >
                    Add stat
                  </Button>
                </div>
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
                        form.setValue(
                          "featuredStats",
                          [...form.getValues("featuredStats"), { ...preset }],
                          { shouldDirty: true },
                        )
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
                        onChange={(event) => {
                          const next = [...form.getValues("featuredStats")];
                          next[index] = { ...next[index], label: event.target.value };
                          form.setValue("featuredStats", next, { shouldDirty: true });
                        }}
                      />
                      <Input
                        value={stat.value}
                        placeholder="Value (e.g. Frost Amphitheater)"
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
              </div>

              <div className="space-y-2">
                <Label>Body</Label>
                <LexicalEditor
                  editorKey={selectedId ?? "new-post"}
                  postId={selectedId ?? undefined}
                  contentJson={form.watch("contentJson")}
                  onChange={(contentJson) =>
                    form.setValue("contentJson", contentJson, { shouldDirty: true })
                  }
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={form.formState.isSubmitting || postLoading}>
                  {form.formState.isSubmitting ? "Saving…" : "Save"}
                </Button>
                {selectedId ? (
                  <Button type="button" variant="destructive" onClick={() => void onDelete()}>
                    Delete
                  </Button>
                ) : null}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
