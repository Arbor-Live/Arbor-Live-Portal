"use client";

import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { DecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode";
import type { SerializedDecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode";
import { useQuery } from "convex/react";
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $parseSerializedNode,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type EditorConfig,
  type ElementFormatType,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type Spread,
  type LexicalUpdateJSON,
} from "lexical";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { Input } from "@/components/ui/input";
import { OptimizedRemoteImage } from "@/components/media/optimized-remote-image";
import { useR2FileUpload } from "@/hooks/use-r2-file-upload";
import { ImmichImportButton } from "@/components/marketing/immich-library-picker";
import { useMarketingEditorChange } from "@/components/editor/lexical-editor-context";
import { api } from "@/lib/convex-api";
import { R2_ASSET_PREFIX } from "@/lib/r2-assets";

export type SerializedImageNode = Spread<
  {
    altText: string;
    src: string;
  },
  SerializedDecoratorBlockNode
>;

export const INSERT_IMAGE_COMMAND = createCommand<{ src: string; altText?: string }>(
  "INSERT_IMAGE_COMMAND",
);

function shouldResolveAssetReference(value: string) {
  if (value.startsWith(R2_ASSET_PREFIX)) return true;
  return !/^https?:\/\//i.test(value);
}

function ImageComponent({
  nodeKey,
  src,
  altText,
}: {
  nodeKey: NodeKey;
  src: string;
  altText: string;
}) {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const notifyContentChange = useMarketingEditorChange();
  const [caption, setCaption] = useState(altText);
  const trimmed = src.trim();
  const needsResolve = trimmed.length > 0 && shouldResolveAssetReference(trimmed);
  const resolved = useQuery(
    api.inventoryR2.resolveAssetUrl,
    needsResolve ? { value: trimmed } : "skip",
  );
  const resolvedSrc = needsResolve
    ? resolved ?? undefined
    : trimmed.startsWith("http")
      ? trimmed
      : undefined;
  const isLoading = needsResolve && resolved === undefined;

  useEffect(() => {
    setCaption(altText);
  }, [altText]);

  function handleCaptionChange(next: string) {
    setCaption(next);
    if (!editable) return;
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isImageNode(node)) {
        node.setAltText(next);
      }
    });
    notifyContentChange?.(JSON.stringify(editor.getEditorState().toJSON()));
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center border bg-muted text-xs text-muted-foreground">
        Loading image…
      </div>
    );
  }

  if (!resolvedSrc) {
    return (
      <div className="flex h-40 items-center justify-center border bg-muted text-xs text-muted-foreground">
        Image unavailable
      </div>
    );
  }

  const captionLabel = (editable ? caption : altText).trim();

  return (
    <figure className="overflow-hidden border bg-muted">
      {editable ? (
        // eslint-disable-next-line @next/next/no-img-element -- editor preview for signed URLs
        <img
          src={resolvedSrc}
          alt={captionLabel || "Image"}
          className="h-auto max-h-[520px] w-full object-cover"
        />
      ) : (
        <OptimizedRemoteImage
          src={resolvedSrc}
          alt={captionLabel || "Image"}
          className="h-auto max-h-[520px] w-full object-cover"
          width={1200}
          height={800}
          sizes="(max-width: 768px) 100vw, 768px"
        />
      )}
      {editable ? (
        <div className="border-t bg-background px-2 py-1.5">
          <Input
            value={caption}
            onChange={(event) => handleCaptionChange(event.target.value)}
            placeholder="Caption or description"
            className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : captionLabel ? (
        <figcaption className="border-t px-3 py-2 text-xs text-muted-foreground">
          {captionLabel}
        </figcaption>
      ) : null}
    </figure>
  );
}

export class ImageNode extends DecoratorBlockNode {
  __src: string;
  __altText: string;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new this(node.__src, node.__altText, node.__format, node.__key);
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    return new this(
      serializedNode.src,
      serializedNode.altText ?? "",
      serializedNode.format,
    );
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedImageNode>): this {
    const self = super.updateFromJSON(serializedNode);
    self.__src = serializedNode.src;
    self.__altText = serializedNode.altText ?? "";
    return self;
  }

  constructor(
    src: string,
    altText: string,
    format?: ElementFormatType,
    key?: NodeKey,
  ) {
    super(format, key);
    this.__src = src;
    this.__altText = altText;
  }

  exportJSON(): SerializedImageNode {
    return {
      ...super.exportJSON(),
      altText: this.__altText,
      src: this.__src,
      type: "image",
      version: 1,
    };
  }

  getAltText(): string {
    return this.getLatest().__altText;
  }

  setAltText(altText: string): this {
    const self = this.getWritable();
    self.__altText = altText;
    return self;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): ReactElement {
    return (
      <BlockWithAlignableContents
        nodeKey={this.getKey()}
        format={this.__format}
        className={{
          base: "my-2 w-full",
          focus: "ring-2 ring-ring ring-offset-2",
        }}
      >
        <ImageComponent nodeKey={this.getKey()} src={this.__src} altText={this.__altText} />
      </BlockWithAlignableContents>
    );
  }

  afterCloneFrom(prevNode: this): void {
    super.afterCloneFrom(prevNode);
    this.__src = prevNode.__src;
    this.__altText = prevNode.__altText;
  }
}

function createSerializedImageNode(
  src: string,
  altText: string,
  format: ElementFormatType = "",
): SerializedImageNode {
  return {
    altText,
    format,
    src,
    type: "image",
    version: 1,
  };
}

export function $createImageNode(
  src: string,
  altText = "",
  format?: ElementFormatType,
): ImageNode {
  return $parseSerializedNode(createSerializedImageNode(src, altText, format ?? "")) as ImageNode;
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node?.getType() === "image";
}

function insertImageNode(src: string, altText: string) {
  const imageNode = $parseSerializedNode(createSerializedImageNode(src, altText));
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    $insertNodes([imageNode]);
    return;
  }
  $getRoot().append(imageNode);
}

export function ImagePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      INSERT_IMAGE_COMMAND,
      (payload) => {
        editor.update(() => {
          insertImageNode(payload.src, payload.altText ?? "");
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}

export function InsertImageButton({
  postId,
  disabled,
}: {
  postId?: string;
  disabled?: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, busy, error } = useR2FileUpload({
    scope: "marketing",
    postId,
    imageKind: "content",
  });

  async function handleFile(file: File) {
    const storedReference = await uploadFile(file);
    if (!storedReference) return;
    editor.update(() => {
      insertImageNode(
        storedReference,
        file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim(),
      );
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-8 items-center rounded-none border border-input bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Image"}
        </button>
        <ImmichImportButton
          postId={postId}
          imageKind="content"
          disabled={disabled || busy}
          className="h-8 rounded-none px-2 text-xs"
          onImported={(storedReference, originalFileName) => {
            editor.update(() => {
              insertImageNode(
                storedReference,
                originalFileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim(),
              );
            });
          }}
        />
      </div>
      {error ? <p className="max-w-xs text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
