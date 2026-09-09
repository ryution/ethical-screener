import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import Analyzer from './Analyzer.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Analyzer />
    <Analytics />
  </StrictMode>,
)
