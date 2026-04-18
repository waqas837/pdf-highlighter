import dynamic from "next/dynamic";

const PdfHighlighter = dynamic(
  () => import("@/components/PdfHighlighter"),
  {
    ssr: false,
    loading: () => (
      <div className="pdf-loading" role="status">
        Loading highlighter…
      </div>
    ),
  },
);

export default function Home() {
  return <PdfHighlighter />;
}
