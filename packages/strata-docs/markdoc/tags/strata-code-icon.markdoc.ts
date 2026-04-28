import { StrataCodeIcon } from "../../components"

export const strataCodeIcon = {
  render: StrataCodeIcon,
  selfClosing: true,
  attributes: {
    size: {
      type: String,
      default: "1.2em",
      description: "Size of the icon (CSS height value)",
    },
  },
}
