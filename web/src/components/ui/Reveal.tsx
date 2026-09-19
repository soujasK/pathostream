import { motion } from 'framer-motion'

interface RevealProps {
  children: React.ReactNode
  delay?: number
}

/** Simple staggered entrance -- used so the dashboard doesn't just pop into
 * existence fully-formed on load. */
export function Reveal({ children, delay = 0 }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
