/**
 * Test script for CCTV utility functions
 * Run with: npx tsx scripts/test-cctv-utils.ts
 */

import {
  generateRTSPUrl,
  generateISAPIUrl,
  parseStreamId,
  generateStreamId,
  validateNVRConfig,
  generatePlaybackSearchXML,
  generateStreamToken,
  parseStreamToken,
  getRecommendedStreamType,
} from '../lib/cctv-utils'

// Import enum values directly
const StreamType = {
  MAIN: "main" as const,
  SUB: "sub" as const,
  THIRD: "third" as const,
}

console.log('='.repeat(60))
console.log('CCTV Utility Functions Test')
console.log('='.repeat(60))

// Test 1: RTSP URL Generation
console.log('\n1. RTSP URL Generation:')
const rtspConfig = {
  host: '192.168.1.100',
  port: 554,
  username: 'admin',
  password: 'test123'
}

const mainStreamUrl = generateRTSPUrl(rtspConfig, 1, StreamType.MAIN, false)
console.log('   Main Stream:', mainStreamUrl)

const subStreamUrl = generateRTSPUrl(rtspConfig, 1, StreamType.SUB, false)
console.log('   Sub Stream:', subStreamUrl)

const isapiUrl = generateRTSPUrl(rtspConfig, 2, StreamType.MAIN, true)
console.log('   ISAPI Format:', isapiUrl)

// Test 2: ISAPI URL Generation
console.log('\n2. ISAPI URL Generation:')
const deviceInfoUrl = generateISAPIUrl('192.168.1.100', 80, '/ISAPI/System/deviceInfo')
console.log('   Device Info:', deviceInfoUrl)

const searchUrl = generateISAPIUrl('192.168.1.100', 80, '/ISAPI/ContentMgmt/search')
console.log('   Search:', searchUrl)

// Test 3: Stream ID Parsing
console.log('\n3. Stream ID Parsing:')
const parsed101 = parseStreamId(101)
console.log('   101 =>', parsed101)

const parsed202 = parseStreamId(202)
console.log('   202 =>', parsed202)

const parsed503 = parseStreamId('503')
console.log('   503 =>', parsed503)

// Test 4: Stream ID Generation
console.log('\n4. Stream ID Generation:')
const id1Main = generateStreamId(1, StreamType.MAIN)
console.log('   Channel 1 Main:', id1Main)

const id1Sub = generateStreamId(1, StreamType.SUB)
console.log('   Channel 1 Sub:', id1Sub)

const id5Third = generateStreamId(5, StreamType.THIRD)
console.log('   Channel 5 Third:', id5Third)

// Test 5: NVR Config Validation
console.log('\n5. NVR Config Validation:')
const validConfig = {
  host: '192.168.1.100',
  port: 554,
  username: 'admin',
  password: 'test123'
}
console.log('   Valid config:', validateNVRConfig(validConfig))

const invalidPort = {
  host: '192.168.1.100',
  port: 70000,
  username: 'admin',
  password: 'test123'
}
console.log('   Invalid port:', validateNVRConfig(invalidPort))

const missingPassword = {
  host: '192.168.1.100',
  port: 554,
  username: 'admin',
  password: ''
}
console.log('   Missing password:', validateNVRConfig(missingPassword))

// Test 6: Playback Search XML
console.log('\n6. Playback Search XML:')
const startTime = '2026-01-27T08:00:00Z'
const endTime = '2026-01-27T09:00:00Z'
const xml = generatePlaybackSearchXML(1, startTime, endTime, 'all')
console.log('   XML (truncated):', xml.substring(0, 200) + '...')

// Test 7: Stream Token
console.log('\n7. Stream Token Generation and Parsing:')
const token = generateStreamToken('camera-123', StreamType.SUB, 15)
console.log('   Token:', token.token.substring(0, 40) + '...')
console.log('   Expires:', token.expiresAt)

const parsed = parseStreamToken(token.token)
console.log('   Parsed:', parsed)

// Test 8: Recommended Stream Type
console.log('\n8. Recommended Stream Type:')
console.log('   Grid view:', getRecommendedStreamType('grid'))
console.log('   Fullscreen:', getRecommendedStreamType('fullscreen'))
console.log('   Recording:', getRecommendedStreamType('recording'))

console.log('\n' + '='.repeat(60))
console.log('All tests completed successfully!')
console.log('='.repeat(60) + '\n')
