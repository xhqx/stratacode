// StrataClaw upgrade view — shown when instance needs upgrade for chat

import { Button } from "@stratacode/strata-ui/button"
import { Card, CardTitle, CardDescription, CardActions } from "@stratacode/strata-ui/card"
import { useClaw } from "../context/claw"
import { useStrataClawLanguage } from "../context/language"

export function UpgradeView() {
  const claw = useClaw()
  const { t } = useStrataClawLanguage()

  return (
    <div class="strataclaw-center">
      <Card class="strataclaw-card">
        <CardTitle icon={false}>{t("strataClaw.upgrade.title")}</CardTitle>
        <CardDescription>
          <p class="strataclaw-card-text">{t("strataClaw.upgrade.description1")}</p>
          <p class="strataclaw-card-text">
            {t("strataClaw.upgrade.description2.before")}
            <strong>{t("strataClaw.upgrade.description2.bold")}</strong>
            {t("strataClaw.upgrade.description2.after")}
          </p>
        </CardDescription>
        <CardActions>
          <div />
          <Button variant="primary" onClick={() => claw.openExternal("https://app.strata.ai/claw")}>
            {t("strataClaw.upgrade.openDashboard")}
          </Button>
        </CardActions>
      </Card>
    </div>
  )
}
