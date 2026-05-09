# 🔗 Hyperlinks

**Professional tools for link extraction, bullet sanitization, and research report processing.**

Hyperlinks is a high-performance web application designed for researchers, analysts, and writers who need to process messy source data into polished, professional rich text ready for Slack, Notion, Wikis, or internal reports.

---

## 🚀 Key Features

### 1. Rich Text Copier
*   **Intelligent Link Processing**: Automatically extracts URLs from raw text, fetches page titles/metadata via internal APIs, and generates formatted HTML where publishers are hyperlinked to their sources.
*   **Bullet Sanitization**: Cleans messy bullet points (•, -, *), capitalizes text, and identifies labels (e.g., "Company Overview:") to apply bold formatting automatically.
*   **Real-time Preview**: See exactly how your processed text will look before copying it to your clipboard.
*   **One-Click Copy**: Specialized rich-text clipboard integration ensures formatting is preserved when pasting into external tools.

### 2. Research Report Pipeline (Report Processor)
*   **Multi-format Upload**: Supports `.txt`, `.doc`, `.docx`, and `.md` file uploads.
*   **AI-Powered Segmentation**: Automatically divides lengthy research reports into high-fidelity sections (I through X) based on structural patterns.
*   **Paste-to-Process**: Quick "Paste Text" mode for processing content directly from your clipboard without saving files.
*   **Section Management**: Individual copy buttons for each extracted section, maintaining hierarchical structure and professional styling.

---

## 🛠️ Tech Stack

*   **Framework**: [Astro 6](https://astro.build/) (Static Site Generator & Server-side Rendering)
*   **UI Library**: [React 19](https://reactjs.org/)
*   **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
*   **Animations**: [Framer Motion](https://www.framer.com/motion/)
*   **Icons**: [Lucide React](https://lucide.dev/)
*   **Parsing Utilities**: 
    *   `Cheerio`: Metadata extraction from URLs
    *   `Mammoth`: DOCX to HTML conversion
    *   `Marked`: Markdown parsing
*   **Runtime**: [Bun](https://bun.sh/)

---

## 📦 Getting Started

### Prerequisites
Ensure you have [Bun](https://bun.sh/) installed on your machine.

### Installation
```sh
# Install dependencies
bun install
```

### Development
```sh
# Start local development server
bun dev
```

### Build
```sh
# Build for production
bun build
```

---

## 📂 Project Structure

```text
/
├── src/
│   ├── components/       # React components (ReportProcessor, RichTextCopier)
│   ├── layouts/          # Astro layouts
│   ├── pages/            # Astro pages & API endpoints
│   ├── styles/           # Global styles & Tailwind config
│   └── assets/           # Static assets
├── public/               # Public assets (favicon, etc.)
├── astro.config.mjs      # Astro configuration
└── package.json          # Dependencies & scripts
```

---

## 🧞 Commands

| Command | Action |
| :--- | :--- |
| `bun install` | Installs dependencies |
| `bun dev` | Starts local dev server at `localhost:4321` |
| `bun build` | Build your production site to `./dist/` |
| `bun preview` | Preview your build locally |
| `bun astro ...` | Run Astro CLI commands |
