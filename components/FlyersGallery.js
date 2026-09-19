"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

const PDFJS_VERSION = "3.11.174";

async function pdfFileToImageBlob(file) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
}

export default function FlyersGallery({ flyers, role, buildingId }) {
  const supabase = createClient();
  const router = useRouter();
  const canManage = role === "관리자" || role === "담당자";
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      let blob;
      if (file.type === "application/pdf") {
        blob = await pdfFileToImageBlob(file);
      } else if (file.type.startsWith("image/")) {
        blob = file;
      } else {
        alert("PDF 또는 이미지 파일만 업로드할 수 있어요.");
        return;
      }
      const title = file.name.replace(/\.[^.]+$/, "");
      const path = `${buildingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
      const { error: upErr } = await supabase.storage.from("flyers").upload(path, blob, {
        contentType: "image/png",
        upsert: false,
      });
      if (upErr) { alert("업로드 실패: " + upErr.message); return; }
      const { data: pub } = supabase.storage.from("flyers").getPublicUrl(path);
      const { error: insErr } = await supabase.from("building_flyers").insert({
        building_id: buildingId, title, image_url: pub.publicUrl,
      });
      if (insErr) { alert("등록 실패: " + insErr.message); return; }
      router.refresh();
    } catch (err) {
      alert("처리 중 오류: " + (err?.message || err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function remove(flyer) {
    if (!confirm("이 안내문을 삭제할까요?")) return;
    await supabase.from("building_flyers").delete().eq("id", flyer.id);
    router.refresh();
  }

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-sm">안내문</div>
        {canManage && (
          <label className="btn-ghost text-xs cursor-pointer">
            {uploading ? "업로드 중..." : "+ 안내문 추가 (PDF/이미지)"}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={handleFile}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {flyers.length === 0 ? (
        <p className="text-sm text-inkDim">등록된 안내문이 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {flyers.map((f) => (
            <div key={f.id} className="group relative">
              <button
                type="button"
                onClick={() => setLightbox(f)}
                className="block w-full aspect-[210/297] rounded-lg overflow-hidden border border-border bg-surface2"
              >
                <img src={f.image_url} alt={f.title || "안내문"} className="w-full h-full object-cover" />
              </button>
              <div className="text-xs text-inkDim mt-1 truncate">{f.title}</div>
              {canManage && (
                <button
                  onClick={() => remove(f)}
                  className="absolute top-1 right-1 bg-black/60 text-white text-xs rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100"
                >
                  삭제
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox.image_url}
            alt={lightbox.title || "안내문"}
            className="max-w-full max-h-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white text-2xl leading-none"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
