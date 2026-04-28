// StrataClaw setup view — shown when no instance is provisioned

import { Button } from "@stratacode/strata-ui/button"
import { Card, CardTitle, CardDescription, CardActions } from "@stratacode/strata-ui/card"
import { useClaw } from "../context/claw"
import { useStrataClawLanguage } from "../context/language"

export function SetupView() {
  const claw = useClaw()
  const { t } = useStrataClawLanguage()

  return (
    <div class="strataclaw-center">
      <Card class="strataclaw-card">
        <CardTitle icon={false}>{t("strataClaw.setup.title")}</CardTitle>
        <CardDescription>
          <h3 class="strataclaw-card-subtitle">{t("strataClaw.setup.subtitle")}</h3>
          <p class="strataclaw-card-text">{t("strataClaw.setup.description1")}</p>
          <p class="strataclaw-card-text">{t("strataClaw.setup.description2")}</p>
        </CardDescription>
        <CardActions>
          <Button variant="ghost" onClick={() => claw.openExternal("https://strata.ai/strataclaw")}>
            {t("strataClaw.setup.learnMore")}
          </Button>
          <Button variant="primary" onClick={() => claw.openExternal("https://app.strata.ai/claw")}>
            {t("strataClaw.setup.tryStrataClaw")}
          </Button>
        </CardActions>
      </Card>
    </div>
  )
}
