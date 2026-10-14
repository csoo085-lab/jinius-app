// 파일 업로드 공용 도구
// 1) 사진은 업로드 전에 자동으로 줄여서 저장 (폰 원본은 그대로)
// 2) 저장 경로에는 영문·숫자 이름만 사용 (Supabase 저장소는 한글 경로를 거부함)
//    → 화면에 보이는 파일명은 원래 이름(한글 포함) 그대로 DB에 기록

const PHOTO_MAX_SIDE = 1600; // 현장 사진: 긴 변 최대 픽셀
export const DOC_MAX_SIDE = 2400; // 서류를 찍은 사진: 글자가 읽히도록 조금 더 크게
const JPEG_QUALITY = 0.8;
const SKIP_TYPES = ["image/gif", "image/svg+xml"]; // 움짤·벡터는 그대로

function extOf(name, type) {
  const m = /\.([a-zA-Z0-9]{1,8})$/.exec(name || "");
  if (m) return m[1].toLowerCase();
  if (type && type.includes("/")) return type.split("/")[1].replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  return "bin";
}

// 사진이면 줄인 JPEG 파일을, 아니면 원본을 돌려줌. 실패하거나 더 커지면 원본 사용
export async function compressImage(file, maxSide = PHOTO_MAX_SIDE) {
  if (!file || !file.type?.startsWith("image/") || SKIP_TYPES.includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // 투명 PNG가 검게 되지 않도록
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const baseName = (file.name || "photo").replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file; // 브라우저가 못 읽는 형식(HEIC 등)은 원본 그대로 업로드
  }
}

// 저장소에 쓸 안전한 파일명 (예: 1760412345678_k3x9q2.jpg)
export function storageFileName(file) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}_${rand}.${extOf(file?.name, file?.type)}`;
}

/**
 * 업로드 준비: 사진이면 압축하고, 안전한 저장 이름을 만들어 줌
 * (서류 화면에서는 { maxSide: DOC_MAX_SIDE } 로 호출)
 * @returns {{ file: File, storageName: string, displayName: string, size: number }}
 *  - file: 실제로 올릴 파일 (압축본 또는 원본)
 *  - storageName: 저장 경로 끝에 붙일 이름
 *  - displayName: 화면에 보여줄 원래 파일명
 *  - size: 실제 저장 크기(bytes)
 */
export async function prepareUpload(original, { maxSide = PHOTO_MAX_SIDE } = {}) {
  const file = await compressImage(original, maxSide);
  return {
    file,
    storageName: storageFileName(file),
    displayName: original.name,
    size: file.size,
  };
}
