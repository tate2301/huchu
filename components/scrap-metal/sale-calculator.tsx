"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CalculatorProps = {
  recordedWeight: number;
  onWeightCalculated: (weight: number) => void;
};

export function SaleCalculator({ recordedWeight, onWeightCalculated }: CalculatorProps) {
  const [display, setDisplay] = useState("0");
  const [history, setHistory] = useState<string[]>([]);

  const handleDigit = useCallback((digit: string) => {
    setDisplay((prev) => {
      if (prev === "0" && digit !== ".") return digit;
      if (digit === "." && prev.includes(".")) return prev;
      return prev + digit;
    });
  }, []);

  const handleOperation = useCallback(
    (op: string) => {
      setHistory((prev) => [...prev, `${display} ${op}`]);
      setDisplay("0");
    },
    [display],
  );

  const handleBackspace = useCallback(() => {
    setDisplay((prev) => {
      if (prev.length === 1) return "0";
      return prev.slice(0, -1);
    });
  }, []);

  const handleClear = useCallback(() => {
    setDisplay("0");
    setHistory([]);
  }, []);

  const handleEquals = useCallback(() => {
    try {
      const expression = `${history.join(" ")} ${display}`.trim();
      const normalized = expression.replace(/x/g, "*");

      const calculate = (expr: string): number => {
        let next = expr.replace(/\s+/g, "");
        while (next.match(/[\d.]+[*/][\d.]+/)) {
          next = next.replace(/(\d+\.?\d*)([*/])(\d+\.?\d*)/, (_, a, op, b) => {
            return op === "*"
              ? (parseFloat(a) * parseFloat(b)).toString()
              : (parseFloat(a) / parseFloat(b)).toString();
          });
        }

        while (next.match(/[\d.]+[+-][\d.]+/)) {
          next = next.replace(/(\d+\.?\d*)([+-])(\d+\.?\d*)/, (_, a, op, b) => {
            return op === "+"
              ? (parseFloat(a) + parseFloat(b)).toString()
              : (parseFloat(a) - parseFloat(b)).toString();
          });
        }

        return parseFloat(next);
      };

      const result = calculate(normalized);
      const finalWeight = parseFloat(result.toFixed(3));
      setDisplay(finalWeight.toString());
      setHistory([]);
      onWeightCalculated(finalWeight);
    } catch {
      setDisplay("Error");
      setTimeout(() => setDisplay("0"), 1000);
    }
  }, [display, history, onWeightCalculated]);

  const currentValue = parseFloat(display) || 0;
  const discrepancy = recordedWeight - currentValue;

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Verify Sold Weight</p>
      </div>

      <Card className="bg-[var(--warm-paper)] p-6 shadow-[var(--surface-frame-shadow)]">
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Sold Weight (kg)</div>
          <div
            className="font-mono text-6xl font-bold tabular-nums transition-all duration-300"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {display}
          </div>
          {history.length > 0 ? <div className="font-mono text-sm text-muted-foreground">{history.join(" ")}</div> : null}
        </div>
      </Card>

      {currentValue > 0 ? (
        <Card className="bg-[var(--warm-paper)] p-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Recorded</div>
              <div className="font-mono font-semibold">{recordedWeight.toFixed(3)} kg</div>
            </div>
            <div>
              <div className="text-muted-foreground">Sold</div>
              <div className="font-mono font-semibold">{currentValue.toFixed(3)} kg</div>
            </div>
            <div>
              <div
                className="text-muted-foreground"
                title="Variance = recorded weight - sold weight. Positive means shrink/loss."
              >
                Shrink / Variance (kg)
              </div>
              <div
                className={cn("font-mono font-semibold", discrepancy > 0 ? "text-destructive" : "text-green-600")}
              >
                {discrepancy > 0 ? "-" : "+"}
                {Math.abs(discrepancy).toFixed(3)} kg
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-4 gap-2">
        {["7", "8", "9"].map((n) => (
          <Button
            key={n}
            variant="outline"
            size="lg"
            className="h-16 text-xl font-semibold"
            onClick={() => handleDigit(n)}
          >
            {n}
          </Button>
        ))}
        <Button variant="secondary" size="lg" className="h-16 text-xl" onClick={() => handleOperation("/")}>
          /
        </Button>

        {["4", "5", "6"].map((n) => (
          <Button
            key={n}
            variant="outline"
            size="lg"
            className="h-16 text-xl font-semibold"
            onClick={() => handleDigit(n)}
          >
            {n}
          </Button>
        ))}
        <Button variant="secondary" size="lg" className="h-16 text-xl" onClick={() => handleOperation("x")}>
          x
        </Button>

        {["1", "2", "3"].map((n) => (
          <Button
            key={n}
            variant="outline"
            size="lg"
            className="h-16 text-xl font-semibold"
            onClick={() => handleDigit(n)}
          >
            {n}
          </Button>
        ))}
        <Button variant="secondary" size="lg" className="h-16 text-xl" onClick={() => handleOperation("-")}>
          -
        </Button>

        <Button variant="outline" size="lg" className="h-16 text-xl font-semibold" onClick={() => handleDigit(".")}>
          .
        </Button>
        <Button variant="outline" size="lg" className="h-16 text-xl font-semibold" onClick={() => handleDigit("0")}>
          0
        </Button>
        <Button variant="destructive" size="lg" className="h-16 text-xl" onClick={handleBackspace}>
          {"<-"}
        </Button>
        <Button variant="secondary" size="lg" className="h-16 text-xl" onClick={() => handleOperation("+")}>
          +
        </Button>

        <Button variant="outline" size="lg" className="col-span-2 h-16 text-lg" onClick={handleClear}>
          Clear
        </Button>
        <Button variant="default" size="lg" className="col-span-2 h-16 text-xl" onClick={handleEquals}>
          =
        </Button>
      </div>
    </div>
  );
}
