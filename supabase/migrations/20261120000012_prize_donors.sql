-- A prize donor is a level of its own.
--
-- The sponsor sheet sells three levels: presenting ($500 and a prize), supporting ($300) and prize donor
-- (a prize worth $75 to $100, no fee). The database had two. A prize needs a sponsor's row to hang on, so a
-- donor could only be entered as `supporting`, and since the supporting sponsors moved into the "With
-- support from" row right under the envelope, that would hand a business that gives a prize the place a
-- supporting sponsor pays $300 for.
--
-- A `donor` is named where the sheet says a prize donor is: with its prize in the list, with its winner on
-- delivery day, and among "Thanks to our sponsors" at the foot. Not on a stamp, and not in the row under
-- the envelope. The limit of four presenting sponsors (migration 0011) doesn't count it.
--
-- On its own in this migration: a new value can't be used in the transaction that adds it.

alter type public.sponsor_tier add value if not exists 'donor';
