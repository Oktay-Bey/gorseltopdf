const fileInput = document.getElementById('fileInput')
const addPageInput = document.getElementById('addPageInput')
const previewImg = document.getElementById('previewImg')
const statusEl = document.getElementById('status')
const generatePdfBtn = document.getElementById('generatePdfBtn')
const openSignPadBtn = document.getElementById('openSignPadBtn')
const downloadPdfBtn = document.getElementById('downloadPdfBtn')
const sharePdfBtn = document.getElementById('sharePdfBtn')
const pdfFrame = document.getElementById('pdfFrame')
const signModal = document.getElementById('signModal')
const signCanvas = document.getElementById('signCanvas')
const closeSignPadBtn = document.getElementById('closeSignPadBtn')
const clearSignBtn = document.getElementById('clearSignBtn')
const applySignBtn = document.getElementById('applySignBtn')
const pagesList = document.getElementById('pagesList')

let imageBlob = null
let imageUrl = null
let pdfBytes = null
let signCanvasCtx = null
let drawing = false
let processedBlob = null
let processedUrl = null
let lastOcrText = ''
let images = []
let activeIndex = 0


function setStatus(t) { statusEl.textContent = t || '' }
function enableActions() {
  const hasImage = images.length > 0
  generatePdfBtn.disabled = !hasImage
  openSignPadBtn.disabled = !hasImage
  downloadPdfBtn.disabled = !pdfBytes
  sharePdfBtn.disabled = !pdfBytes
}

fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || [])
  if (!files.length) return
  const converted = await Promise.all(files.map(async (f)=>{
    let b = f
    if (f.type === 'image/heic' || f.type === 'image/heif') {
      try { b = await heic2any({ blob: f, toType: 'image/png', quality: 0.92 }) } catch {}
    }
    return { blob: b, url: URL.createObjectURL(b), processedBlob: null, processedUrl: null, signaturePng: null }
  }))
  images = converted
  activeIndex = 0
  previewImg.src = images[0].url
  previewImg.style.display = 'block'
  pdfBytes = null
  renderPages()
  setStatus('Görseller yüklendi')
  enableActions()
})

addPageInput.addEventListener('change', async (e) => {
  const f = e.target.files?.[0]
  if (!f) return
  let b = f
  if (f.type === 'image/heic' || f.type === 'image/heif') {
    try { b = await heic2any({ blob: f, toType: 'image/png', quality: 0.92 }) } catch {}
  }
  images.push({ blob: b, url: URL.createObjectURL(b), processedBlob: null, processedUrl: null, signaturePng: null })
  activeIndex = images.length - 1
  previewImg.src = images[activeIndex].url
  previewImg.style.display = 'block'
  pdfBytes = null
  renderPages()
  setStatus('Sayfa eklendi')
  enableActions()
})

let pdfUrl = null

generatePdfBtn.addEventListener('click', async () => {
  if (!images.length) return
  setStatus('PDF oluşturuluyor…')
  const pdfDoc = await PDFLib.PDFDocument.create()
  const helv = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica)
  for (let i=0;i<images.length;i++) {
    const it = images[i]
    const srcBlob = it.processedBlob || it.blob
    let embedded
    try {
      const bmp = await createImageBitmap(srcBlob)
      const cnv = document.createElement('canvas')
      cnv.width = bmp.width
      cnv.height = bmp.height
      const ctx = cnv.getContext('2d')
      ctx.drawImage(bmp, 0, 0)
      const pngBlob = await new Promise((resolve)=>cnv.toBlob(resolve, 'image/png', 0.92))
      const ab = new Uint8Array(await pngBlob.arrayBuffer())
      embedded = await pdfDoc.embedPng(ab)
    } catch {
      const ab = new Uint8Array(await srcBlob.arrayBuffer())
      try { embedded = await pdfDoc.embedJpg(ab) } catch { embedded = await pdfDoc.embedPng(ab) }
    }
    const page = pdfDoc.addPage([595, 842])
    const { width, height } = embedded
    const scale = Math.min(575 / width, 822 / height)
    const drawW = width * scale
    const drawH = height * scale
    const x = (595 - drawW) / 2
    const y = (842 - drawH) / 2
    page.drawImage(embedded, { x, y, width: drawW, height: drawH })
    if (it.signaturePng) {
      const sig = await pdfDoc.embedPng(new Uint8Array(it.signaturePng))
      const sw = sig.width
      const sh = sig.height
      const sScale = Math.min(180 / sw, 80 / sh)
      const sW = sw * sScale
      const sH = sh * sScale
      page.drawImage(sig, { x: 595 - sW - 20, y: 20, width: sW, height: sH })
    }
  }
  pdfBytes = await pdfDoc.save()
  setStatus('PDF hazır')
  updatePdfPreview()
  enableActions()
})


openSignPadBtn.addEventListener('click', () => {
  if (!images.length) return
  signModal.classList.remove('hidden')
  const rect = signCanvas.getBoundingClientRect()
  signCanvas.width = Math.floor(rect.width)
  signCanvas.height = Math.floor(rect.height)
  signCanvasCtx = signCanvas.getContext('2d')
  signCanvasCtx.strokeStyle = '#fff'
  signCanvasCtx.lineWidth = 2
})

closeSignPadBtn.addEventListener('click', () => { signModal.classList.add('hidden') })
clearSignBtn.addEventListener('click', () => { signCanvasCtx.clearRect(0, 0, signCanvas.width, signCanvas.height) })

function pointerPos(e) {
  const rect = signCanvas.getBoundingClientRect()
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
  return { x, y }
}

signCanvas.addEventListener('pointerdown', (e) => {
  drawing = true
  const { x, y } = pointerPos(e)
  signCanvasCtx.beginPath()
  signCanvasCtx.moveTo(x, y)
})
signCanvas.addEventListener('pointermove', (e) => {
  if (!drawing) return
  const { x, y } = pointerPos(e)
  signCanvasCtx.lineTo(x, y)
  signCanvasCtx.stroke()
})
signCanvas.addEventListener('pointerup', () => { drawing = false })
signCanvas.addEventListener('pointerleave', () => { drawing = false })

applySignBtn.addEventListener('click', async () => {
  if (!images.length) return
  const pngDataUrl = signCanvas.toDataURL('image/png')
  const pngRes = await fetch(pngDataUrl)
  const pngBuf = await pngRes.arrayBuffer()
  images[activeIndex].signaturePng = pngBuf
  pdfBytes = null
  signModal.classList.add('hidden')
  setStatus('İmza eklendi, PDF oluşturulduğunda sayfaya eklenecek')
  enableActions()
})

downloadPdfBtn.addEventListener('click', () => {
  if (!pdfBytes) return
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'belge.pdf'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  setStatus('PDF indirildi')
})

function updatePdfPreview() {
  if (!pdfBytes) return
  if (typeof pdfUrl !== 'undefined' && pdfUrl) URL.revokeObjectURL(pdfUrl)
  pdfUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }))
  pdfFrame.src = pdfUrl
  pdfFrame.style.display = 'block'
}

sharePdfBtn.addEventListener('click', async () => {
  if (!pdfBytes) return
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  const file = new File([blob], 'belge.pdf', { type: 'application/pdf' })
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Belge', text: 'Belge paylaşımı' })
      setStatus('Paylaşıldı')
    } catch { setStatus('Paylaşım iptal edildi') }
  } else {
    setStatus('Paylaşım desteklenmiyor, lütfen indirip manuel paylaşın')
  }
})

//

// Otomatik tarama, OCR ve PAdES akışları kaldırıldı

function renderPages() {
  pagesList.innerHTML = ''
  for (let i=0;i<images.length;i++) {
    const it = images[i]
    const div = document.createElement('div')
    div.className = 'page-item' + (i===activeIndex ? ' active' : '')
    const img = document.createElement('img')
    img.className = 'page-thumb'
    img.src = it.processedUrl || it.url
    const actions = document.createElement('div')
    actions.className = 'page-actions'
    const btnSel = document.createElement('button')
    btnSel.className = 'btn'
    btnSel.textContent = 'Seç'
    btnSel.onclick = ()=>{ activeIndex = i; previewImg.src = images[i].processedUrl || images[i].url; renderPages() }
    const btnUp = document.createElement('button')
    btnUp.className = 'btn'
    btnUp.textContent = '↑'
    btnUp.onclick = ()=>{ if (i>0) { const t=images[i]; images[i]=images[i-1]; images[i-1]=t; activeIndex = i-1; renderPages() } }
    const btnDown = document.createElement('button')
    btnDown.className = 'btn'
    btnDown.textContent = '↓'
    btnDown.onclick = ()=>{ if (i<images.length-1) { const t=images[i]; images[i]=images[i+1]; images[i+1]=t; activeIndex = i+1; renderPages() } }
    const btnDel = document.createElement('button')
    btnDel.className = 'btn'
    btnDel.textContent = 'Sil'
    btnDel.onclick = ()=>{ images.splice(i,1); if (!images.length) { previewImg.style.display='none'; pdfBytes=null } else { activeIndex = Math.max(0, activeIndex-1); previewImg.src = images[activeIndex].processedUrl || images[activeIndex].url } renderPages(); enableActions(); setStatus('Sayfa silindi') }
    actions.appendChild(btnSel)
    actions.appendChild(btnUp)
    actions.appendChild(btnDown)
    actions.appendChild(btnDel)
    div.appendChild(img)
    div.appendChild(actions)
    pagesList.appendChild(div)
  }
}