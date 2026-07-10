import React from 'react'
import { AuctionCountdown } from 'kuadrat-client'

const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString()
const inMinutes = (m: number) => new Date(Date.now() + m * 60000).toISOString()

export const EnCurso = () => <AuctionCountdown endDatetime={inDays(2)} isEnded={false} />
export const Urgente = () => <AuctionCountdown endDatetime={inMinutes(3)} isEnded={false} />
export const Finalizada = () => <AuctionCountdown endDatetime={inDays(-1)} isEnded={true} />
