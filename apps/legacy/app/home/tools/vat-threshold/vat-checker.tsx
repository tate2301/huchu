"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { ArrowRight, CheckCircle, ExternalLink, TriangleAlert } from "@/lib/icons";
import { whatsappHref } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";
import {
  VAT_REGISTRATION_WINDOW_DAYS,
  VAT_STANDARD_RATE,
  VAT_THRESHOLD_WINDOW_MONTHS,
  checkVatThreshold,
  type TurnoverBasis,
} from "@/lib/marketing/penalty";
import { formatUsd } from "@/lib/marketing/pricing";

/**
 * Interactivity is confined here so the page around it stays a server
 * component. The threshold test itself is in `lib/marketing/penalty.ts` under
 * test, including the boundary case — equalling the threshold is not yet
 * liability, and getting that wrong would tell a business to register a year
 * early.
 */
export function VatThresholdChecker() {
  const turnoverId = useId();
  const basisId = useId();
  const [turnover, setTurnover] = useState("2500");
  const [basis, setBasis] = useState<TurnoverBasis>("monthly");

  const result = useMemo(
    () => checkVatThreshold({ turnoverUsd: Number.parseFloat(turnover), basis }),
    [turnover, basis],
  );

  const whatsappMessage = result.mustRegister
    ? `Hi Corelith. My taxable supplies are about ${formatUsd(result.annualTaxableSuppliesUsd)} over twelve months, so I am over the VAT threshold. I need invoicing and fiscalisation sorted.`
    : `Hi Corelith. My taxable supplies are about ${formatUsd(result.annualTaxableSuppliesUsd)} over twelve months. I want to be ready before I cross the VAT threshold.`;

  return (
    <div className={styles.cardGrid2}>
      <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
        <div className={styles.field}>
          <label htmlFor={turnoverId}>Taxable supplies, US dollars</label>
          <input
            id={turnoverId}
            className={styles.input}
            type="number"
            inputMode="decimal"
            min={0}
            step={100}
            value={turnover}
            onChange={(event) => setTurnover(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor={basisId}>Measured over</label>
          <select
            id={basisId}
            className={styles.select}
            value={basis}
            onChange={(event) => setBasis(event.target.value as TurnoverBasis)}
          >
            <option value="monthly">A typical month</option>
            <option value="annual">The last twelve months</option>
          </select>
        </div>

        <p className={styles.small}>
          Taxable supplies means standard-rated and zero-rated sales. Exempt supplies are left out,
          and so are once-off private sales. If your turnover is in ZWG, convert it at the rate you
          use for your returns.
        </p>
      </form>

      <div className={styles.stack}>
        <div className={styles.card}>
          <p className={styles.eyebrow}>Taxable supplies over {VAT_THRESHOLD_WINDOW_MONTHS} months</p>
          <p className={styles.price}>{formatUsd(result.annualTaxableSuppliesUsd)}</p>
          <p className={styles.priceMeta}>
            against a compulsory registration threshold of {formatUsd(result.thresholdUsd)}
          </p>

          <div className={styles.statStrip}>
            <div className={styles.statTile}>
              <strong>{Math.round(result.thresholdRatio * 100)}%</strong>
              <span>Of the threshold used</span>
            </div>
            <div className={styles.statTile}>
              <strong>
                {result.mustRegister
                  ? formatUsd(result.excessUsd)
                  : formatUsd(result.headroomUsd)}
              </strong>
              <span>{result.mustRegister ? "Above the threshold" : "Turnover still to go"}</span>
            </div>
          </div>
        </div>

        {result.mustRegister ? (
          <div className={`${styles.alert} ${styles.alertError}`}>
            <strong>
              <TriangleAlert className={styles.icon} weight="regular" /> You are required to register
            </strong>
            <span>
              Taxable supplies of {formatUsd(result.annualTaxableSuppliesUsd)} exceed the{" "}
              {formatUsd(result.thresholdUsd)} threshold, so registration is compulsory and ZIMRA
              should be notified within {VAT_REGISTRATION_WINDOW_DAYS} days. Once registered you
              charge VAT at {Math.round(VAT_STANDARD_RATE * 100)}% — roughly{" "}
              {formatUsd(result.indicativeAnnualOutputVatUsd)} of output VAT a year on this turnover,
              before input credits — and you must issue fiscal receipts.
            </span>
          </div>
        ) : result.status === "approaching" ? (
          <div className={styles.alert}>
            <strong>
              <TriangleAlert className={styles.icon} weight="regular" /> Close enough to plan for it
            </strong>
            <span>
              You are {formatUsd(result.headroomUsd)} of turnover from the threshold. Registration is
              triggered by supplies you <em>expect</em> to make as well as supplies you have made, so
              a good quarter can put you over it before the year ends. Being ready is cheaper than
              being caught.
            </span>
          </div>
        ) : (
          <div className={`${styles.alert} ${styles.alertSuccess}`}>
            <strong>
              <CheckCircle className={styles.icon} weight="regular" /> Below the threshold
            </strong>
            <span>
              Compulsory registration does not apply at {formatUsd(result.annualTaxableSuppliesUsd)}{" "}
              a year. You may still register voluntarily to claim input VAT, which is often worth it
              if you buy from registered suppliers or sell to corporates and government.
            </span>
          </div>
        )}

        <p className={styles.small}>
          A threshold test is not a tax opinion. Whether a particular supply is taxable, zero-rated
          or exempt is a question for your accountant, and this tool does not answer it.
        </p>

        <a
          href={whatsappHref(whatsappMessage)}
          className={`${styles.button} ${styles.buttonPrimary}`}
          target="_blank"
          rel="noreferrer"
        >
          Talk it through on WhatsApp
          <ExternalLink className={styles.icon} weight="regular" />
        </a>
        <Link href="/home/tools/fiscalisation-penalty" className={styles.inlineAction}>
          If you are registered, work out your fiscalisation exposure
          <ArrowRight className={styles.icon} weight="regular" />
        </Link>
      </div>
    </div>
  );
}
