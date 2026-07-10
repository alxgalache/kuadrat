import React from 'react'
import { EventCountdown } from 'kuadrat-client'

const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString()

export const Proximamente = () => <EventCountdown eventDatetime={inDays(3)} status="scheduled" />
export const EnDirecto = () => <EventCountdown eventDatetime={inDays(0)} status="active" />
export const Finalizado = () => <EventCountdown eventDatetime={inDays(-1)} status="finished" />
