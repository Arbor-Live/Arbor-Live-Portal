export const EMPTY_LEXICAL_STATE = JSON.stringify({
  root: {
    children: [
      {
        children: [],
        direction: null,
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
      },
    ],
    direction: null,
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

export const lexicalTheme = {
  paragraph: "mb-2 leading-relaxed",
  quote: "my-3 border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground",
  heading: {
    h1: "mb-3 mt-6 text-2xl font-semibold tracking-tight",
    h2: "mb-2 mt-5 text-xl font-semibold tracking-tight",
    h3: "mb-2 mt-4 text-lg font-semibold",
  },
  list: {
    ul: "my-2 list-disc pl-5",
    ol: "my-2 list-decimal pl-5",
    listitem: "my-0.5",
  },
  link: "text-primary underline underline-offset-2",
  text: {
    bold: "font-semibold",
    italic: "italic",
    underline: "underline",
  },
};

export const lexicalEditorClassName =
  "min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export const lexicalViewerClassName =
  "markdown-content min-w-0 break-words text-base leading-relaxed [&_a]:text-primary [&_a]:underline";
