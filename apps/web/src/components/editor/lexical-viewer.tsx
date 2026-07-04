"use client";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { cn } from "@/lib/utils";
import { marketingEditorNodes } from "./lexical-nodes";
import {
  EMPTY_LEXICAL_STATE,
  lexicalTheme,
  lexicalViewerClassName,
} from "./lexical-theme";

function createViewerConfig(contentJson: string): InitialConfigType {
  return {
    namespace: "ArborMarketingViewer",
    theme: lexicalTheme,
    editable: false,
    onError(error: Error) {
      throw error;
    },
    editorState: contentJson || EMPTY_LEXICAL_STATE,
    nodes: marketingEditorNodes,
  };
}

export function LexicalViewer({
  contentJson,
  className,
}: {
  contentJson: string;
  className?: string;
}) {
  return (
    <div className={cn(lexicalViewerClassName, className)}>
      <LexicalComposer key={contentJson} initialConfig={createViewerConfig(contentJson)}>
        <RichTextPlugin
          contentEditable={<ContentEditable className="outline-none" aria-readonly />}
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ListPlugin />
        <LinkPlugin />
      </LexicalComposer>
    </div>
  );
}
