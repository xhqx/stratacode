import React from "react"
import { Icon } from "./Icon"

interface StrataCodeIconProps {
  size?: string
}

export function StrataCodeIcon({ size = "1.2em" }: StrataCodeIconProps) {
  return <Icon src="/docs/img/strata-v1.svg" srcDark="/docs/img/strata-v1-white.svg" alt="Strata Code Icon" size={size} />
}
