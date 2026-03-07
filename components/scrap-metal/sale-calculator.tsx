"use client";

import { useState, useCallback } from "react";
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

  const handleOperation = useCallback((op: string) => {
    setHistory((prev) => [...prev, `${display} ${op}`]);
    setDisplay("0");
  }, [display]);

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
      // Safe calculator evaluation without eval
      const expression = history.join(" ") + " " + display;
      const normalized = expression.replace(/×/g, "*").replace(/÷/g, "/").trim();

      // Simple calculator parser for basic arithmetic
      const calculate = (expr: string): number => {
        // Remove spaces
        expr = expr.replace(/\s+/g, "");

        // Handle multiplication and division first
        while (expr.match(/[\d.]+[*/][\d.]+/)) {
          expr = expr.replace(/(\d+\.?\d*)([*/])(\d+\.?\d*)/, (_, a, op, b) => {
            return op === "*" ? (parseFloat(a) * parseFloat(b)).toString() : (parseFloat(a) / parseFloat(b)).toString();
          });
        }

        // Handle addition and subtraction
        while (expr.match(/[\d.]+[+-][\d.]+/)) {
          expr = expr.replace(/(\d+\.?\d*)([+-])(\d+\.?\d*)/, (_, a, op, b) => {
            return op === "+" ? (parseFloat(a) + parseFloat(b)).toString() : (parseFloat(a) - parseFloat(b)).toString();
          });
        }

        return parseFloat(expr);
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
      {/* Instructional header */}
      <div className="text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Verify Sold Weight</p>
        <p>
          Enter the actual weight sold to the buyer using the calculator below. The discrepancy shows the difference between recorded batch weight and sold weight—positive values indicate weight loss during transport or handling.
        </p>
      </div>

      {/* Large animated total display */}
      <Card className="p-6 bg-[var(--warm-paper)] shadow-[var(--surface-frame-shadow)]">
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Sold Weight (kg)</div>
          <div
            className="text-6xl font-bold font-mono tabular-nums transition-all duration-300"
            style={{
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {display}
          </div>
          {history.length > 0 && (
            <div className="text-sm text-muted-foreground font-mono">
              {history.join(" ")}
            </div>
          )}
        </div>
      </Card>

      {/* Discrepancy display */}
      {currentValue > 0 && (
        <Card className="p-4 bg-[var(--warm-paper)]">
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
              <div className="text-muted-foreground">Discrepancy</div>
              <div
                className={cn(
                  "font-mono font-semibold",
                  discrepancy > 0 ? "text-destructive" : "text-green-600"
                )}
              >
                {discrepancy > 0 ? "-" : "+"}{Math.abs(discrepancy).toFixed(3)} kg
              </div>
            </div>
          </div>
          {discrepancy > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Weight loss detected. Verify the sold weight is correct before approving.
            </p>
          )}
        </Card>
      )}

      {/* Number keyboard */}
      <div className="grid grid-cols-4 gap-2">
        {/* Numbers 7-9 */}
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
        <Button
          variant="secondary"
          size="lg"
          className="h-16 text-xl"
          onClick={() => handleOperation("÷")}
        >
          ÷
        </Button>

        {/* Numbers 4-6 */}
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
        <Button
          variant="secondary"
          size="lg"
          className="h-16 text-xl"
          onClick={() => handleOperation("×")}
        >
          ×
        </Button>

        {/* Numbers 1-3 */}
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
        <Button
          variant="secondary"
          size="lg"
          className="h-16 text-xl"
          onClick={() => handleOperation("-")}
        >
          -
        </Button>

        {/* Bottom row */}
        <Button
          variant="outline"
          size="lg"
          className="h-16 text-xl font-semibold"
          onClick={() => handleDigit(".")}
        >
          .
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-16 text-xl font-semibold"
          onClick={() => handleDigit("0")}
        >
          0
        </Button>
        <Button
          variant="destructive"
          size="lg"
          className="h-16 text-xl"
          onClick={handleBackspace}
        >
          ←
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="h-16 text-xl"
          onClick={() => handleOperation("+")}
        >
          +
        </Button>

        {/* Action buttons */}
        <Button
          variant="outline"
          size="lg"
          className="h-16 text-lg col-span-2"
          onClick={handleClear}
        >
          Clear
        </Button>
        <Button
          variant="default"
          size="lg"
          className="h-16 text-xl col-span-2"
          onClick={handleEquals}
        >
          =
        </Button>
      </div>
    </div>
  );
}
