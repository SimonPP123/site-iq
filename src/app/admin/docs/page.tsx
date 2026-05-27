import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import fs from "fs";
import path from "path";
import { requireAdmin } from "@/lib/admin-guard";

async function getDocs() {
    const docsDir = path.join(process.cwd(), "docs");
    // Check if directory exists
    if (!fs.existsSync(docsDir)) {
        return [];
    }

    const files = fs.readdirSync(docsDir).filter((file) => file.endsWith(".md"));

    const docs = files.map((file) => {
        const content = fs.readFileSync(path.join(docsDir, file), "utf-8");
        return {
            slug: file.replace(".md", ""),
            title: file.replace(/_/g, " ").replace(".md", "").replace(/\b\w/g, l => l.toUpperCase()),
            content,
        };
    });

    return docs;
}

export default async function DocsPage() {
    await requireAdmin();
    const docs = await getDocs();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Documentation</h2>
            </div>

            <div className="grid gap-6 lg:grid-cols-4">
                <div className="lg:col-span-1 space-y-1 sticky top-6 max-h-[calc(100vh-4rem)] overflow-y-auto pr-2">
                    {docs.map((doc) => (
                        <a
                            key={doc.slug}
                            href={`#${doc.slug}`}
                            className="block px-3 py-2 text-sm font-medium rounded-md text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                        >
                            {doc.title}
                        </a>
                    ))}
                </div>

                <div className="lg:col-span-3 space-y-12">
                    {docs.map((doc) => (
                        <section key={doc.slug} id={doc.slug} className="scroll-mt-10">
                            <div className="rounded-xl border bg-white p-8 shadow-sm dark:bg-neutral-950 dark:border-neutral-800">
                                <h3 className="text-2xl font-bold mb-6 border-b pb-2">{doc.title}</h3>
                                <article className="prose dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-blue-600 hover:prose-a:text-blue-500">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {doc.content}
                                    </ReactMarkdown>
                                </article>
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
