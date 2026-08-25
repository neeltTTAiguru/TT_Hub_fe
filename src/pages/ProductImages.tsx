import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Input, Space, Tag, Typography, message } from 'antd'
import {
  deleteProductImage,
  describeProductImage,
  listProductImages,
  productImageUrl,
  setProductImageReference,
  uploadProductImage,
  type ProductImage,
} from '../lib/api'

const { Text, Title } = Typography
const { TextArea } = Input

// The approved product photography every generated article image is built from.
// One of these is the reference: the generator hands it to the image API as the
// device's geometry, so replacing it changes what the T500 looks like in every
// article written afterwards. That is why it is chosen here deliberately rather
// than inferred from a filename.
export default function ProductImages() {
  const [images, setImages] = useState<ProductImage[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const dragDepth = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // Bumped on every change so the thumbnails re-fetch. A replaced image keeps
  // its name, and without this the browser goes on showing the old one.
  const [version, setVersion] = useState(() => String(Date.now()))

  const load = () => listProductImages()
    .then((result) => { setImages(result.images); setError('') })
    .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the product images.'))

  useEffect(() => { void load() }, [])

  const send = async (incoming: File[]) => {
    const usable = incoming.filter((file) => /\.(png|jpe?g|webp)$/i.test(file.name))
    if (incoming.length && !usable.length) {
      message.error('Only PNG, JPEG and WebP images can be approved.')
      return
    }
    setBusy(true)
    let added = 0
    for (const file of usable) {
      try {
        const result = await uploadProductImage(file)
        added += 1
        if (result.replaced) message.info(`${result.name} replaced`)
      } catch (cause) {
        message.error(`${file.name}: ${cause instanceof Error ? cause.message : 'upload failed'}`)
      }
    }
    setBusy(false)
    setVersion(String(Date.now()))
    await load()
    if (added) message.success(`${added} image(s) added`)
  }

  const makeReference = async (name: string) => {
    try {
      await setProductImageReference(name)
      message.success(`${name} is now the reference — new article artwork will be built from it.`)
      await load()
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not set the reference.')
    }
  }

  const remove = async (name: string) => {
    try {
      await deleteProductImage(name)
      await load()
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : 'Could not delete that image.')
    }
  }

  return (
    <div className="page">
      <Title level={3} className="page-title">Product images</Title>
      <p className="page-subtitle">
        Approved photography for article artwork. The reference image is what the T500 is generated from.
      </p>

      <div
        className={`company-files-dropzone${dragActive ? ' company-files-dropzone-active' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragActive(true) }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault()
          dragDepth.current -= 1
          if (dragDepth.current <= 0) { dragDepth.current = 0; setDragActive(false) }
        }}
        onDrop={(event) => {
          event.preventDefault()
          dragDepth.current = 0
          setDragActive(false)
          void send(Array.from(event.dataTransfer.files || []))
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click() }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(event) => {
            void send(Array.from(event.target.files || []))
            event.target.value = ''
          }}
        />
        <Space direction="vertical" align="center" size={4}>
          <Text strong>{busy ? 'Uploading…' : 'Drop product photos here'}</Text>
          <Text type="secondary">
            PNG, JPEG or WebP, up to 15MB. A photo with the same name replaces the one already approved.
          </Text>
        </Space>
      </div>

      {error ? <Alert type="error" showIcon message="Product images unavailable" description={error} style={{ marginTop: 16 }} /> : null}

      <Card
        className="section-card"
        title="Approved"
        extra={<Tag color="gold">{images.length} image(s)</Tag>}
        style={{ marginTop: 16 }}
      >
        {images.length ? (
          <div className="product-image-grid">
            {images.map((image) => (
              <figure key={image.name} className={`product-image${image.isReference ? ' product-image-reference' : ''}`}>
                <img src={productImageUrl(image.name, version)} alt={image.name} loading="lazy" />
                <figcaption>
                  <span className="product-image-name">
                    <Text strong ellipsis>{image.name}</Text>
                    {image.isReference ? <Tag color="green">Reference</Tag> : null}
                  </span>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {(image.sizeBytes / 1024).toFixed(0)} KB
                  </Text>
                  <TextArea
                    defaultValue={image.description}
                    placeholder="What does this photo show? The writer picks images by this."
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    onBlur={(event) => {
                      const next = event.target.value.trim()
                      if (next === image.description) return
                      void describeProductImage(image.name, next)
                        .then(() => { message.success(next ? 'Description saved' : 'Description cleared'); void load() })
                        .catch((cause) => message.error(cause instanceof Error ? cause.message : 'Could not save that description.'))
                    }}
                  />
                  {image.description ? null : (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Without a description this photo is never offered to the writer.
                    </Text>
                  )}
                  <Space size={8}>
                    {image.isReference ? null : (
                      <Button size="small" onClick={() => void makeReference(image.name)}>Make reference</Button>
                    )}
                    <Button size="small" danger disabled={image.isReference} onClick={() => void remove(image.name)}>
                      Delete
                    </Button>
                  </Space>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <Text type="secondary">No approved images yet — drop one above.</Text>
        )}
      </Card>

      <Alert
        type="info"
        showIcon
        style={{ marginTop: 16 }}
        message="What makes a good reference"
        description="The generator works from this image to keep the device right, so a clean front-facing shot on a plain background reads better than a styled one. The whole device should be in frame, evenly lit, at the highest resolution you have."
      />
    </div>
  )
}
