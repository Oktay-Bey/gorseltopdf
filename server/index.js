const express = require('express')
const cors = require('cors')
const multer = require('multer')
const { SignPdf, plainAddPlaceholder } = require('node-signpdf')

const app = express()
app.use(cors())
const upload = multer({ storage: multer.memoryStorage() })

app.get('/health', (req, res) => res.json({ ok: true }))

app.post('/sign', upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'p12', maxCount: 1 }]), async (req, res) => {
  try {
    if (!req.files || !req.files.pdf || !req.files.p12) return res.status(400).json({ error: 'files-missing' })
    const pdf = req.files.pdf[0].buffer
    const p12 = req.files.p12[0].buffer
    const passphrase = req.body.passphrase || ''

    const pdfWithPlaceholder = plainAddPlaceholder({ pdfBuffer: pdf, reason: 'Signed', contactInfo: '', name: 'Signer' })
    const signer = new SignPdf()
    const signed = signer.sign(pdfWithPlaceholder, p12, { passphrase })

    res.setHeader('Content-Type', 'application/pdf')
    res.send(Buffer.from(signed))
  } catch (e) {
    res.status(500).json({ error: 'sign-failed', message: String(e && e.message || e) })
  }
})

const port = process.env.PORT || 8080
app.listen(port, () => console.log('PAdES server running on :' + port))