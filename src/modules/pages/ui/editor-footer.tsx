import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { usePageEditor } from "./use-page-editor";
export interface EditorFooterProps {
  editor: ReturnType<typeof usePageEditor>;
}
export function EditorFooter({ editor }: EditorFooterProps) {
  return (
    <div className="sticky bottom-20 z-20 mt-6 flex flex-wrap items-center gap-2 border border-border bg-background p-3 shadow-lg md:bottom-4">
      <p className="min-w-0 flex-1 text-sm">
        {t(editor.draft.publishedAt ? "pages.published" : "pages.draft")}
        {editor.draft.publishedAt && (
          <time className="ms-2" dateTime={editor.draft.publishedAt}>
            {new Date(editor.draft.publishedAt).toLocaleString("ar-KW")}
          </time>
        )}
        {editor.dirty && <span className="ms-2 text-muted-foreground">{t("pages.dirty")}</span>}
      </p>
      <Button
        className="min-h-11"
        disabled={editor.busy || !editor.valid || !editor.dirty}
        onClick={() => void editor.execute("save")}
      >
        {t("pages.save")}
      </Button>
      <Button
        className="min-h-11"
        disabled={editor.busy || !editor.canPublish}
        onClick={() => void editor.execute("publish")}
      >
        {t("pages.publish")}
      </Button>
      {editor.draft.publishedAt && (
        <Button
          className="min-h-11"
          variant="outline"
          disabled={editor.busy}
          onClick={() => void editor.execute("unpublish")}
        >
          {t("pages.unpublish")}
        </Button>
      )}
      {editor.message && (
        <p className="w-full text-sm" role="status">
          {t(editor.message)}
        </p>
      )}
    </div>
  );
}
