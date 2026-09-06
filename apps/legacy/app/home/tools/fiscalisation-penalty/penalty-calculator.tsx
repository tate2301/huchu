"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { ArrowRight, ExternalLink, Gavel, TriangleAlert } from "@corelithzw/ui/lib/icons";
import { whatsappHref } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  PENALTY_CAP_DAYS,
  PENALTY_MAX_DAYS,
  PENALTY_MAX_TILLS,
  PENALTY_USD_PER_TILL_PER_DAY,
  calculateFiscalisationPenalty,
} from "@/lib/marketing/penalty";
import { formatUsd } from "@/lib/marketing/pricing";

/**
 * The only interactive part of the page, so it is the only part that ships as
 * a client component. The arithmetic itself lives in `lib/marketing/penalty.ts`
 * under test — including the 181-day cap, which is the figure an accountant
 * checks first.
 */
export function PenaltyCalculator() {
  const tillsId = useId();
  const daysId = useId();
  const [tills, setTills] = useState("3");
  const [days, setDays] = useState("60");

  const result = useMemo(
    () =>
      calculateFiscalisationPenalty({
        tills: Number.parseFloat(tills),
        daysInDefault: Number.parseFloat(days),
      }),
    [tills, days],
  );

  const whatsappMessage = result.tills
    ? `Hi Corelith. I have ${result.tills} till${result.tills === 1 ? "" : "s"} that ${
        result.tills === 1 ? "is" : "are"
      } not fiscalised, about ${result.daysInDefault} days. Your calculator puts my civil penalty exposure at ${formatUsd(
        result.penaltyUsd,
      )}. What would it take to get fiscalised?`
    : "Hi Corelith, I need to get my tills fiscalised. Where do I start?";

  return (
    <div className={styles.cardGrid2}>
      <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
        <div className={styles.field}>
          <label htmlFor={tillsId}>Points of sale not fiscalised</label>
          <input
            id={tillsId}
            className={styles.input}
            type="number"
            inputMode="numeric"
            min={0}
            max={PENALTY_MAX_TILLS}
            step={1}
            value={tills}
            onChange={(event) => setTills(event.target.value)}
          />
          <p className={styles.small}>
            Every till, counter or invoicing point that issues taxable supplies counts separately.
          </p>
        </div>

        <div className={styles.field}>
          <label htmlFor={daysId}>Days in default</label>
          <input
            id={daysId}
            className={styles.input}
            type="number"
            inputMode="numeric"
            min={0}
            max={PENALTY_MAX_DAYS}
            step={1}
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
          <p className={styles.small}>
            Counted from the day the obligation started, not from the day you noticed it.
          </p>
        </div>

        <p className={styles.small}>
          {formatUsd(PENALTY_USD_PER_TILL_PER_DAY)} per point of sale per day, for a maximum of{" "}
          {PENALTY_CAP_DAYS} days. This is an estimate of civil penalty exposure, not a tax opinion,
          and it excludes any VAT, interest or assessment ZIMRA raises separately.
        </p>
      </form>

      <div className={styles.stack}>
        <div className={styles.card}>
          <p className={styles.eyebrow}>Civil penalty exposure</p>
          <p className={styles.price}>{formatUsd(result.penaltyUsd)}</p>
          <p className={styles.priceMeta}>
            {result.tills} {result.tills === 1 ? "till" : "tills"} &times; {result.chargeableDays}{" "}
            chargeable {result.chargeableDays === 1 ? "day" : "days"} &times;{" "}
            {formatUsd(PENALTY_USD_PER_TILL_PER_DAY)}
          </p>

          <div className={styles.statStrip}>
            <div className={styles.statTile}>
              <strong>{formatUsd(result.dailyPenaltyUsd)}</strong>
              <span>{result.isCapped ? "Further daily civil penalty" : "Added every further day"}</span>
            </div>
            <div className={styles.statTile}>
              <strong>{result.daysUntilCap}</strong>
              <span>Days of civil penalty left before the cap</span>
            </div>
          </div>
        </div>

        {result.isCapped ? (
          <div className={`${styles.alert} ${styles.alertError}`}>
            <strong>
              <TriangleAlert className={styles.icon} weight="regular" /> Past {PENALTY_CAP_DAYS} days
              — this is no longer a fine
            </strong>
            <span>
              The civil penalty stopped accruing at {formatUsd(result.penaltyUsd)}. A default running{" "}
              {result.daysBeyondCap} {result.daysBeyondCap === 1 ? "day" : "days"} past the cap is an
              offence: on conviction, a fine not exceeding level seven, imprisonment for up to 12
              months, or both. Anyone quoting you {formatUsd(result.uncappedPenaltyUsd)} for this is
              multiplying past a cap that exists.
            </span>
          </div>
        ) : (
          <div className={styles.alert}>
            <strong>
              <Gavel className={styles.icon} weight="regular" /> The cap is not relief
            </strong>
            <span>
              After {PENALTY_CAP_DAYS} days the daily penalty stops, because continuing in default
              becomes a criminal offence instead: a fine not exceeding level seven, imprisonment for
              up to 12 months, or both. You have {result.daysUntilCap}{" "}
              {result.daysUntilCap === 1 ? "day" : "days"} before that line.
            </span>
          </div>
        )}

        <a
          href={whatsappHref(whatsappMessage)}
          className={`${styles.button} ${styles.buttonPrimary}`}
          target="_blank"
          rel="noreferrer"
        >
          Send these numbers to us on WhatsApp
          <ExternalLink className={styles.icon} weight="regular" />
        </a>
        <Link href="/home/pricing" className={styles.inlineAction}>
          See what fiscalising costs per month
          <ArrowRight className={styles.icon} weight="regular" />
        </Link>
      </div>
    </div>
  );
}
