"use client";

import { useMemo } from "react";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { defineExtension } from "lexical";
import { cn } from "@/lib/utils";
import { marketingEditorNodes } from "./lexical-nodes";
import {
  EMPTY_LEXICAL_STATE,
  lexicalTheme,
  lexicalViewerClassName,
} from "./lexical-theme";

function createViewerExtension(contentJson: string) {
  return defineExtension({
    name: "ArborMarketingViewer",
    namespace: "ArborMarketingViewer",
    theme: lexicalTheme,
    editable: false,
    onError(error: Error) {
      throw error;
    },
    $initialEditorState: contentJson || EMPTY_LEXICAL_STATE,
    nodes: marketingEditorNodes,
  });
}

export function LexicalViewer({
  contentJson,
  className,
}: {
  contentJson: string;
  className?: string;
}) {
  // The composer rebuilds its editor whenever the extension object changes,
  // so it must only change when the content does.
  const extension = useMemo(() => createViewerExtension(contentJson), [contentJson]);

  return (
    <div className={cn(lexicalViewerClassName, className)}>
      <LexicalExtensionComposer extension={extension} contentEditable={null}>
        <RichTextPlugin
          contentEditable={<ContentEditable className="outline-none" aria-readonly />}
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ListPlugin />
        <LinkPlugin />
      </LexicalExtensionComposer>
    </div>
  );
}
