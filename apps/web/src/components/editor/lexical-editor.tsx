"use client";

import { useCallback, useEffect, useState } from "react";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { $createHeadingNode, $createQuoteNode, HeadingTagType } from "@lexical/rich-text";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
} from "lexical";
import { $setBlocksType } from "@lexical/selection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ImagePlugin,
  InsertImageButton,
} from "./lexical-image-node";
import { MarketingEditorChangeContext } from "./lexical-editor-context";
import { marketingEditorNodes } from "./lexical-nodes";
import {
  EMPTY_LEXICAL_STATE,
  lexicalEditorClassName,
  lexicalTheme,
} from "./lexical-theme";

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      className="h-8 px-2 text-xs"
      title={title}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function EditorToolbar({ postId }: { postId?: string }) {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          setIsBold(false);
          setIsItalic(false);
          return;
        }
        setIsBold(selection.hasFormat("bold"));
        setIsItalic(selection.hasFormat("italic"));
      });
    });
  }, [editor]);

  const formatHeading = (tag: HeadingTagType) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createHeadingNode(tag));
      }
    });
  };

  const formatParagraph = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createParagraphNode());
      }
    });
  };

  const formatQuote = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createQuoteNode());
      }
    });
  };

  const insertLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
    setLinkUrl("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 p-2">
      <ToolbarButton
        title="Bold"
        active={isBold}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      >
        B
      </ToolbarButton>
      <ToolbarButton
        title="Italic"
        active={isItalic}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      >
        I
      </ToolbarButton>
      <ToolbarButton title="Heading 2" onClick={() => formatHeading("h2")}>
        H2
      </ToolbarButton>
      <ToolbarButton title="Heading 3" onClick={() => formatHeading("h3")}>
        H3
      </ToolbarButton>
      <ToolbarButton title="Paragraph" onClick={formatParagraph}>
        P
      </ToolbarButton>
      <ToolbarButton title="Quote" onClick={formatQuote}>
        Quote
      </ToolbarButton>
      <ToolbarButton
        title="Bullet list"
        onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
      >
        • List
      </ToolbarButton>
      <ToolbarButton
        title="Numbered list"
        onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
      >
        1. List
      </ToolbarButton>
      <InsertImageButton postId={postId} />
      <div className="flex min-w-[220px] flex-1 items-center gap-1">
        <Input
          value={linkUrl}
          onChange={(event) => setLinkUrl(event.target.value)}
          placeholder="https://…"
          className="h-8 text-xs"
        />
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={insertLink}>
          Link
        </Button>
      </div>
    </div>
  );
}

function OnChangePlugin({
  onChange,
}: {
  onChange: (editorStateJson: string) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      onChange(JSON.stringify(editorState.toJSON()));
    });
  }, [editor, onChange]);

  return null;
}

function createEditorConfig(contentJson: string): InitialConfigType {
  return {
    namespace: "ArborMarketingEditor",
    theme: lexicalTheme,
    onError(error: Error) {
      throw error;
    },
    editorState: contentJson || EMPTY_LEXICAL_STATE,
    nodes: marketingEditorNodes,
  };
}

export function LexicalEditor({
  editorKey,
  postId,
  contentJson,
  onChange,
  className,
}: {
  editorKey: string;
  postId?: string;
  contentJson: string;
  onChange: (contentJson: string) => void;
  className?: string;
}) {
  const handleChange = useCallback(
    (next: string) => {
      onChange(next);
    },
    [onChange],
  );

  return (
    <div className={cn("overflow-hidden rounded-md border", className)}>
      <MarketingEditorChangeContext.Provider value={handleChange}>
        <LexicalComposer key={editorKey} initialConfig={createEditorConfig(contentJson)}>
          <EditorToolbar postId={postId} />
          <div className="relative">
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className={lexicalEditorClassName}
                  aria-label="Post body"
                />
              }
              placeholder={
                <div className="pointer-events-none absolute px-3 py-2 text-sm text-muted-foreground">
                  Write the story…
                </div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
          </div>
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
          <ImagePlugin />
          <OnChangePlugin onChange={handleChange} />
        </LexicalComposer>
      </MarketingEditorChangeContext.Provider>
    </div>
  );
}
