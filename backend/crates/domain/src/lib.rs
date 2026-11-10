use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error, PartialEq)]
pub enum DomainError {
    #[error("amount must be positive and within the outstanding balance")]
    Amount,
    #[error("this action is not allowed in the current state")]
    Transition,
    #[error("parcel must have a label, contents and completed packing")]
    NotReady,
    #[error("unsupported currency")]
    Currency,
}

pub fn currency_precision(currency: &str) -> Result<u8, DomainError> {
    match currency {
        "EUR" | "USD" | "GBP" | "CHF" | "CAD" | "AUD" => Ok(2),
        "JPY" | "KRW" => Ok(0),
        "BHD" | "KWD" => Ok(3),
        _ => Err(DomainError::Currency),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReturnState {
    Requested,
    Packed,
    DroppedOff,
    Delivered,
    Resolved,
    Cancelled,
}
impl ReturnState {
    pub fn advance(self, next: Self) -> Result<Self, DomainError> {
        use ReturnState::*;
        if matches!(
            (self, next),
            (Requested, Packed)
                | (Packed, DroppedOff)
                | (DroppedOff, Delivered)
                | (Delivered, Resolved)
                | (Requested, Cancelled)
                | (Packed, Cancelled)
        ) {
            Ok(next)
        } else {
            Err(DomainError::Transition)
        }
    }
}
pub fn refund_balance(expected: i64, received: i64, fees: i64) -> Result<i64, DomainError> {
    if expected < 0 || received < 0 || fees < 0 {
        return Err(DomainError::Amount);
    }
    expected
        .checked_sub(received)
        .and_then(|n| n.checked_sub(fees))
        .filter(|n| *n >= 0)
        .ok_or(DomainError::Amount)
}
pub fn record_refund(
    expected: i64,
    received: i64,
    fees: i64,
    amount: i64,
) -> Result<i64, DomainError> {
    let balance = refund_balance(expected, received, fees)?;
    if amount <= 0 || amount > balance {
        return Err(DomainError::Amount);
    }
    Ok(balance - amount)
}
pub fn parcel_ready(label: bool, contents: usize, packed: bool) -> Result<(), DomainError> {
    if label && contents > 0 && packed {
        Ok(())
    } else {
        Err(DomainError::NotReady)
    }
}
/// V1: log-scaled same-currency price, one-hot category (4), one-hot method (3).
/// No outcome timing is used: it is not available when initiating a return.
pub fn similarity_features(price_minor: i64, category: usize, method: usize) -> [f32; 8] {
    let mut v = [0.; 8];
    v[0] = ((price_minor.max(0) as f32).ln_1p() / 16.).min(1.) * 0.5;
    if category < 4 {
        v[1 + category] = 1.;
    }
    if method < 3 {
        v[5 + method] = 0.75;
    }
    v
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn partial_refunds_and_fees() {
        assert_eq!(record_refund(10000, 3000, 500, 2000), Ok(4500));
        assert_eq!(record_refund(100, 90, 0, 11), Err(DomainError::Amount));
    }
    #[test]
    fn precision_is_explicit() {
        assert_eq!(currency_precision("JPY"), Ok(0));
        assert_eq!(currency_precision("KWD"), Ok(3));
        assert!(currency_precision("ZZZ").is_err());
    }
    #[test]
    fn prevents_overflow() {
        assert!(refund_balance(i64::MAX, i64::MAX, 1).is_err());
    }
    #[test]
    fn lifecycle_cannot_skip_or_reopen() {
        assert!(
            ReturnState::Requested
                .advance(ReturnState::Resolved)
                .is_err()
        );
        assert!(ReturnState::Cancelled.advance(ReturnState::Packed).is_err());
        assert_eq!(
            ReturnState::Packed.advance(ReturnState::DroppedOff),
            Ok(ReturnState::DroppedOff)
        );
    }
    #[test]
    fn readiness_requires_correct_documents() {
        assert!(parcel_ready(false, 1, true).is_err());
        assert!(parcel_ready(true, 0, true).is_err());
        assert!(parcel_ready(true, 1, true).is_ok());
    }
    #[test]
    fn vector_categories_are_not_ordinal() {
        let a = similarity_features(1000, 0, 0);
        let b = similarity_features(1000, 1, 0);
        let c = similarity_features(1000, 2, 0);
        let distance =
            |x: [f32; 8], y: [f32; 8]| x.iter().zip(y).map(|(a, b)| (a - b).powi(2)).sum::<f32>();
        assert_eq!(distance(a, b), distance(a, c));
    }
}
