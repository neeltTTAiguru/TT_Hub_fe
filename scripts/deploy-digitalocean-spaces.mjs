import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const {
  DO_SPACES_ACCESS_KEY_ID,
  DO_SPACES_SECRET_ACCESS_KEY,
  DO_SPACES_BUCKET,
  DO_SPACES_REGION,
  DO_SPACES_ENDPOINT,
  DO_SPACES_PREFIX = '',
  DO_SPACES_CACHE_CONTROL = 'public, max-age=60, must-revalidate',
} = process.env

const required = {
  DO_SPACES_ACCESS_KEY_ID,
  DO_SPACES_SECRET_ACCESS_KEY,
  DO_SPACES_BUCKET,
  DO_SPACES_REGION,
}

const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([key]) => key)

if (missing.length > 0) {
  console.error(`Missing required DigitalOcean Spaces environment variables: ${missing.join(', ')}`)
  process.exit(1)
}

const artifactPath = join(process.cwd(), 'dist', 'index.html')

if (!existsSync(artifactPath)) {
  console.error('Missing dist/index.html. Run npm run build first.')
  process.exit(1)
}

const endpoint = DO_SPACES_ENDPOINT || `https://${DO_SPACES_REGION}.digitaloceanspaces.com`
const normalizedPrefix = DO_SPACES_PREFIX.replace(/^\/+|\/+$/g, '')
const destination = `s3://${DO_SPACES_BUCKET}/${normalizedPrefix ? `${normalizedPrefix}/` : ''}index.html`

const env = {
  ...process.env,
  AWS_ACCESS_KEY_ID: DO_SPACES_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: DO_SPACES_SECRET_ACCESS_KEY,
  AWS_DEFAULT_REGION: DO_SPACES_REGION,
}

const args = [
  's3',
  'cp',
  artifactPath,
  destination,
  '--endpoint-url',
  endpoint,
  '--acl',
  'public-read',
  '--content-type',
  'text/html; charset=utf-8',
  '--cache-control',
  DO_SPACES_CACHE_CONTROL,
]

console.log(`Uploading ${artifactPath} to ${destination}`)

const result = spawnSync('aws', args, {
  env,
  stdio: 'inherit',
})

if (result.error?.code === 'ENOENT') {
  console.error('The AWS CLI is not installed. Install AWS CLI v2, then rerun npm run deploy:do.')
  process.exit(1)
}

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

console.log('DigitalOcean Spaces upload complete.')
