import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Heading,
  HStack,
  Icon,
  Input,
  Text,
  Textarea,
  VStack,
  useColorModeValue,
  Divider,
  Alert,
  AlertIcon,
  CloseButton,
} from '@chakra-ui/react';
import { FiArrowLeft, FiCode, FiUploadCloud, FiUpload, FiLayout } from 'react-icons/fi';
import { useCreateJob } from '../hooks/useJobs';

interface SampleEntry {
  code: string;
  filename: string;
  name: string;
}

const SAMPLES: SampleEntry[] = [
  {
    name: 'Customer Invoice Report',
    filename: 'INVOICE.REPORT.bp',
    code: `* ============================================================
* INVOICE.REPORT - Daily Invoice Summary Report
* Generates a formatted summary of all invoices for the day
* ============================================================
PROGRAM INVOICE.REPORT

* Open required files
OPEN 'INVOICE' TO INVOICE.FILE ELSE
    PRINT "FATAL: Cannot open INVOICE file"
    STOP
END
OPEN 'CUSTOMER' TO CUSTOMER.FILE ELSE
    PRINT "FATAL: Cannot open CUSTOMER file"
    STOP
END
OPEN 'SALESMAN' TO SALESMAN.FILE ELSE
    PRINT "FATAL: Cannot open SALESMAN file"
    STOP
END

* Initialise counters
TOTAL.AMOUNT  = 0
TOTAL.TAX     = 0
INVOICE.COUNT = 0
ERROR.COUNT   = 0
TODAY         = DATE()

* Print report header
PRINT "Daily Invoice Report - ":OCONV(TODAY, "D2/")
PRINT STRING('-', 72)
PRINT "INV#      CUSTOMER                  SALESMAN        AMOUNT       TAX"
PRINT STRING('-', 72)

* Select all invoices dated today
SELECT INVOICE.FILE WITH INV.DATE = TODAY
LOOP
    READNEXT INVOICE.ID ELSE EXIT
    READ INV.REC FROM INVOICE.FILE, INVOICE.ID THEN
        CUST.ID   = INV.REC<1>
        SALES.ID  = INV.REC<2>
        INV.DATE  = INV.REC<3>
        INV.AMT   = INV.REC<4>
        INV.TAX   = INV.REC<5>
        INV.STATUS = INV.REC<6>

        * Skip voided invoices
        IF INV.STATUS = 'VOID' THEN CONTINUE

        * Validate amount
        IF NOT(NUM(INV.AMT)) THEN
            PRINT "WARNING: Invalid amount for invoice ":INVOICE.ID
            ERROR.COUNT += 1
            CONTINUE
        END

        * Look up customer name
        READ CUST.REC FROM CUSTOMER.FILE, CUST.ID THEN
            CUST.NAME = CUST.REC<1>
        END ELSE
            CUST.NAME = 'UNKNOWN (':CUST.ID:')'
            ERROR.COUNT += 1
        END

        * Look up salesman name
        READ SALES.REC FROM SALESMAN.FILE, SALES.ID THEN
            SALES.NAME = SALES.REC<1>
        END ELSE
            SALES.NAME = 'N/A'
        END

        * Accumulate totals
        TOTAL.AMOUNT += INV.AMT
        TOTAL.TAX    += INV.TAX
        INVOICE.COUNT += 1

        * Print invoice line
        PRINT INVOICE.ID "L#10":CUST.NAME "L#30":SALES.NAME "L#16":OCONV(INV.AMT, "MD2,$") "R#12":OCONV(INV.TAX, "MD2,$") "R#10"
    END ELSE
        PRINT "WARNING: Could not read invoice ":INVOICE.ID
        ERROR.COUNT += 1
    END
REPEAT

* Print footer
PRINT STRING('-', 72)
PRINT "TOTAL INVOICES : ":INVOICE.COUNT
PRINT "TOTAL AMOUNT   : ":OCONV(TOTAL.AMOUNT, "MD2,$")
PRINT "TOTAL TAX      : ":OCONV(TOTAL.TAX, "MD2,$")
IF ERROR.COUNT > 0 THEN
    PRINT "ERRORS         : ":ERROR.COUNT:" (review audit log)"
END
PRINT STRING('-', 72)

STOP
END`,
  },
  {
    name: 'Order Processing Workflow',
    filename: 'ORDER.PROCESS.bp',
    code: `* ============================================================
* ORDER.PROCESS - Multi-step order fulfilment workflow
* Validates stock, reserves inventory, creates shipment record
* ============================================================
PROGRAM ORDER.PROCESS

EQU TRUE  TO 1
EQU FALSE TO 0

OPEN 'ORDERS'    TO ORDERS.FILE    ELSE STOP "Cannot open ORDERS"
OPEN 'INVENTORY' TO INVENTORY.FILE ELSE STOP "Cannot open INVENTORY"
OPEN 'SHIPMENTS' TO SHIPMENTS.FILE ELSE STOP "Cannot open SHIPMENTS"
OPEN 'CUSTOMERS' TO CUSTOMERS.FILE ELSE STOP "Cannot open CUSTOMERS"
OPEN 'PRODUCTS'  TO PRODUCTS.FILE  ELSE STOP "Cannot open PRODUCTS"
OPEN 'AUDIT.LOG' TO AUDIT.FILE     ELSE STOP "Cannot open AUDIT.LOG"

* Process each pending order
SELECT ORDERS.FILE WITH ORDER.STATUS = 'PENDING'
LOOP
    READNEXT ORDER.ID ELSE EXIT
    READU ORDER.REC FROM ORDERS.FILE, ORDER.ID LOCKED
        PRINT "Order ":ORDER.ID:" locked by another process - skipping"
        CONTINUE
    END ELSE
        PRINT "Order ":ORDER.ID:" not found"
        CONTINUE
    END

    CUST.ID      = ORDER.REC<1>
    ORDER.DATE   = ORDER.REC<2>
    ITEM.COUNT   = DCOUNT(ORDER.REC<3>, @VM)
    ORDER.TOTAL  = 0
    CAN.FULFILL  = TRUE
    REASON       = ''

    * Validate customer credit limit
    READ CUST.REC FROM CUSTOMERS.FILE, CUST.ID THEN
        CREDIT.LIMIT = CUST.REC<5>
        CREDIT.USED  = CUST.REC<6>
        IF (CREDIT.USED + ORDER.TOTAL) > CREDIT.LIMIT THEN
            CAN.FULFILL = FALSE
            REASON = 'CREDIT_LIMIT_EXCEEDED'
        END
    END ELSE
        CAN.FULFILL = FALSE
        REASON = 'CUSTOMER_NOT_FOUND'
    END

    * Check stock for each line item
    IF CAN.FULFILL THEN
        FOR LINE = 1 TO ITEM.COUNT
            PROD.ID    = ORDER.REC<3, LINE>
            QTY.NEEDED = ORDER.REC<4, LINE>
            UNIT.PRICE = ORDER.REC<5, LINE>

            READU PROD.REC FROM INVENTORY.FILE, PROD.ID LOCKED
                CAN.FULFILL = FALSE
                REASON = 'INVENTORY_LOCKED:':PROD.ID
            END THEN
                QTY.ON.HAND = PROD.REC<3>
                IF QTY.ON.HAND < QTY.NEEDED THEN
                    CAN.FULFILL = FALSE
                    REASON = 'INSUFFICIENT_STOCK:':PROD.ID
                    RELEASE INVENTORY.FILE, PROD.ID
                END ELSE
                    * Reserve stock
                    PROD.REC<3> = QTY.ON.HAND - QTY.NEEDED
                    WRITE PROD.REC ON INVENTORY.FILE, PROD.ID
                    ORDER.TOTAL += QTY.NEEDED * UNIT.PRICE
                END
            END ELSE
                CAN.FULFILL = FALSE
                REASON = 'PRODUCT_NOT_FOUND:':PROD.ID
            END

            IF NOT(CAN.FULFILL) THEN EXIT
        NEXT LINE
    END

    * Create shipment or flag order
    IF CAN.FULFILL THEN
        SHIP.ID = 'SHP':TIMEDATE()
        SHIP.REC = ''
        SHIP.REC<1> = ORDER.ID
        SHIP.REC<2> = CUST.ID
        SHIP.REC<3> = DATE()
        SHIP.REC<4> = 'PENDING_DISPATCH'
        SHIP.REC<5> = ORDER.TOTAL
        WRITE SHIP.REC ON SHIPMENTS.FILE, SHIP.ID

        ORDER.REC<7> = 'FULFILLED'
        ORDER.REC<8> = SHIP.ID
        ORDER.REC<9> = DATE()
        WRITE ORDER.REC ON ORDERS.FILE, ORDER.ID

        GOSUB WRITE.AUDIT.LOG
        PRINT "Order ":ORDER.ID:" fulfilled - Shipment ":SHIP.ID
    END ELSE
        ORDER.REC<7> = 'ON_HOLD'
        ORDER.REC<10> = REASON
        WRITE ORDER.REC ON ORDERS.FILE, ORDER.ID
        PRINT "Order ":ORDER.ID:" on hold - ":REASON
    END

REPEAT

STOP

* ---- Subroutine: write audit entry ----
WRITE.AUDIT.LOG:
    AUDIT.ID = 'AUD':TIMEDATE()
    AUDIT.REC<1> = ORDER.ID
    AUDIT.REC<2> = DATE()
    AUDIT.REC<3> = TIME()
    AUDIT.REC<4> = 'ORDER_FULFILLED'
    AUDIT.REC<5> = SHIP.ID
    WRITE AUDIT.REC ON AUDIT.FILE, AUDIT.ID
RETURN

END`,
  },
  {
    name: 'Payroll Calculation Engine',
    filename: 'PAYROLL.CALC.bp',
    code: `* ============================================================
* PAYROLL.CALC - Weekly payroll processing with tax bands
* Handles regular, overtime, bonus and statutory deductions
* ============================================================
PROGRAM PAYROLL.CALC

EQU OVERTIME.THRESHOLD TO 40
EQU OVERTIME.RATE      TO 1.5
EQU NI.RATE            TO 0.12
EQU PENSION.RATE       TO 0.05

OPEN 'EMPLOYEES'   TO EMP.FILE     ELSE STOP "Cannot open EMPLOYEES"
OPEN 'TIMESHEETS'  TO TIME.FILE    ELSE STOP "Cannot open TIMESHEETS"
OPEN 'PAYSLIPS'    TO PAY.FILE     ELSE STOP "Cannot open PAYSLIPS"
OPEN 'TAX.BANDS'   TO TAX.FILE     ELSE STOP "Cannot open TAX.BANDS"
OPEN 'DEPARTMENTS' TO DEPT.FILE    ELSE STOP "Cannot open DEPARTMENTS"

WEEK.END.DATE = DATE()
TOTAL.GROSS   = 0
TOTAL.NET     = 0
EMP.COUNT     = 0

SELECT EMP.FILE WITH EMP.STATUS = 'ACTIVE'
LOOP
    READNEXT EMP.ID ELSE EXIT
    READ EMP.REC FROM EMP.FILE, EMP.ID ELSE CONTINUE

    EMP.NAME      = EMP.REC<1>
    DEPT.ID       = EMP.REC<2>
    HOURLY.RATE   = EMP.REC<3>
    TAX.CODE      = EMP.REC<4>
    NI.NUMBER     = EMP.REC<5>
    PENSION.OPT   = EMP.REC<6>   ;* Y or N
    BONUS.AMOUNT  = EMP.REC<7>

    * Read this week's timesheet
    TIME.KEY = EMP.ID:"*":WEEK.END.DATE
    READ TIME.REC FROM TIME.FILE, TIME.KEY ELSE
        PRINT "WARNING: No timesheet for ":EMP.ID:" - skipping"
        CONTINUE
    END

    REG.HOURS  = TIME.REC<1>
    OT.HOURS   = 0

    * Separate overtime
    IF REG.HOURS > OVERTIME.THRESHOLD THEN
        OT.HOURS  = REG.HOURS - OVERTIME.THRESHOLD
        REG.HOURS = OVERTIME.THRESHOLD
    END

    * Gross pay
    REG.PAY  = REG.HOURS  * HOURLY.RATE
    OT.PAY   = OT.HOURS   * HOURLY.RATE * OVERTIME.RATE
    GROSS.PAY = REG.PAY + OT.PAY + BONUS.AMOUNT

    * Look up tax band
    READ TAX.REC FROM TAX.FILE, TAX.CODE THEN
        TAX.FREE.AMT  = TAX.REC<1>
        BASIC.RATE    = TAX.REC<2>
        HIGHER.RATE   = TAX.REC<3>
        HIGHER.THRESH = TAX.REC<4>
    END ELSE
        TAX.FREE.AMT  = 0
        BASIC.RATE    = 0.20
        HIGHER.RATE   = 0.40
        HIGHER.THRESH = 999999
    END

    * Calculate income tax
    TAXABLE = GROSS.PAY - (TAX.FREE.AMT / 52)  ;* Weekly allowance
    IF TAXABLE < 0 THEN TAXABLE = 0
    IF TAXABLE > HIGHER.THRESH THEN
        INCOME.TAX = (HIGHER.THRESH * BASIC.RATE) + ((TAXABLE - HIGHER.THRESH) * HIGHER.RATE)
    END ELSE
        INCOME.TAX = TAXABLE * BASIC.RATE
    END

    * National Insurance
    NI.DEDUCTION = GROSS.PAY * NI.RATE

    * Pension (optional)
    PENSION.DED = 0
    IF PENSION.OPT = 'Y' THEN
        PENSION.DED = GROSS.PAY * PENSION.RATE
    END

    NET.PAY = GROSS.PAY - INCOME.TAX - NI.DEDUCTION - PENSION.DED

    * Write payslip record
    PAY.KEY = EMP.ID:"*":WEEK.END.DATE
    PAY.REC = ''
    PAY.REC<1>  = EMP.NAME
    PAY.REC<2>  = DEPT.ID
    PAY.REC<3>  = WEEK.END.DATE
    PAY.REC<4>  = REG.HOURS
    PAY.REC<5>  = OT.HOURS
    PAY.REC<6>  = GROSS.PAY
    PAY.REC<7>  = INCOME.TAX
    PAY.REC<8>  = NI.DEDUCTION
    PAY.REC<9>  = PENSION.DED
    PAY.REC<10> = NET.PAY
    WRITE PAY.REC ON PAY.FILE, PAY.KEY

    TOTAL.GROSS += GROSS.PAY
    TOTAL.NET   += NET.PAY
    EMP.COUNT   += 1

REPEAT

PRINT "Payroll complete. Employees: ":EMP.COUNT
PRINT "Total Gross: ":OCONV(TOTAL.GROSS, "MD2,$")
PRINT "Total Net  : ":OCONV(TOTAL.NET,   "MD2,$")

STOP
END`,
  },
  {
    name: 'Inventory Reorder System',
    filename: 'INVENTORY.REORDER.bp',
    code: `* ============================================================
* INVENTORY.REORDER - Automatic reorder point detection
* Calculates EOQ, raises purchase orders for low-stock items
* ============================================================
PROGRAM INVENTORY.REORDER

EQU SAFETY.FACTOR TO 1.5
EQU DAYS.PER.YEAR TO 365

OPEN 'INVENTORY'   TO INV.FILE    ELSE STOP "Cannot open INVENTORY"
OPEN 'SUPPLIERS'   TO SUP.FILE    ELSE STOP "Cannot open SUPPLIERS"
OPEN 'PO.HEADER'   TO POH.FILE    ELSE STOP "Cannot open PO.HEADER"
OPEN 'PO.LINES'    TO POL.FILE    ELSE STOP "Cannot open PO.LINES"
OPEN 'USAGE.HIST'  TO USG.FILE    ELSE STOP "Cannot open USAGE.HIST"
OPEN 'REORDER.LOG' TO LOG.FILE    ELSE STOP "Cannot open REORDER.LOG"

PO.GROUP     = 0   ;* Group orders by supplier
ORDER.COUNT  = 0
SKIP.COUNT   = 0

* Check every stocked item
SELECT INV.FILE
LOOP
    READNEXT ITEM.ID ELSE EXIT
    READ INV.REC FROM INV.FILE, ITEM.ID ELSE CONTINUE

    QTY.ON.HAND    = INV.REC<1>
    REORDER.POINT  = INV.REC<2>
    MAX.STOCK      = INV.REC<3>
    UNIT.COST      = INV.REC<4>
    LEAD.DAYS      = INV.REC<5>
    SUPPLIER.ID    = INV.REC<6>
    ITEM.DESC      = INV.REC<7>
    LAST.ORDER.DATE = INV.REC<8>
    ON.ORDER.QTY   = INV.REC<9>

    * Skip items already on order
    IF ON.ORDER.QTY > 0 THEN
        SKIP.COUNT += 1
        CONTINUE
    END

    * Skip if stock is adequate
    IF QTY.ON.HAND > REORDER.POINT THEN CONTINUE

    * Retrieve 12-month usage for EOQ calculation
    ANNUAL.USAGE = 0
    FOR MONTH = 1 TO 12
        USG.KEY = ITEM.ID:"*":MONTH
        READ USG.REC FROM USG.FILE, USG.KEY THEN
            ANNUAL.USAGE += USG.REC<1>
        END
    NEXT MONTH

    * EOQ = SQRT(2 * Annual Demand * Ordering Cost / Holding Cost)
    IF ANNUAL.USAGE <= 0 THEN
        ORDER.QTY = MAX.STOCK - QTY.ON.HAND
    END ELSE
        HOLDING.COST  = UNIT.COST * 0.20   ;* 20% holding cost
        ORDERING.COST = 25.00              ;* Fixed cost per order
        DAILY.DEMAND  = ANNUAL.USAGE / DAYS.PER.YEAR
        SAFETY.STOCK  = DAILY.DEMAND * LEAD.DAYS * SAFETY.FACTOR

        EOQ = SQRT(2 * ANNUAL.USAGE * ORDERING.COST / HOLDING.COST)
        ORDER.QTY = INT(EOQ)
        IF ORDER.QTY < (SAFETY.STOCK - QTY.ON.HAND) THEN
            ORDER.QTY = INT(SAFETY.STOCK - QTY.ON.HAND) + 1
        END
    END

    * Look up supplier details
    READ SUP.REC FROM SUP.FILE, SUPPLIER.ID THEN
        SUP.NAME    = SUP.REC<1>
        SUP.EMAIL   = SUP.REC<2>
        SUP.MIN.ORD = SUP.REC<3>  ;* Minimum order quantity
    END ELSE
        PRINT "WARNING: Supplier ":SUPPLIER.ID:" not found for item ":ITEM.ID
        CONTINUE
    END

    * Enforce minimum order quantity
    IF ORDER.QTY < SUP.MIN.ORD THEN ORDER.QTY = SUP.MIN.ORD

    * Raise purchase order
    PO.ID = 'PO':DATE():'-':ITEM.ID
    POH.REC<1> = SUPPLIER.ID
    POH.REC<2> = SUP.NAME
    POH.REC<3> = DATE()
    POH.REC<4> = 'PENDING'
    POH.REC<5> = ORDER.QTY * UNIT.COST
    WRITE POH.REC ON POH.FILE, PO.ID

    POL.REC<1> = ITEM.ID
    POL.REC<2> = ITEM.DESC
    POL.REC<3> = ORDER.QTY
    POL.REC<4> = UNIT.COST
    POL.REC<5> = ORDER.QTY * UNIT.COST
    WRITE POL.REC ON POL.FILE, PO.ID:'-1'

    * Update inventory on-order quantity
    INV.REC<9> = ORDER.QTY
    WRITE INV.REC ON INV.FILE, ITEM.ID

    * Log the reorder event
    LOG.REC<1> = ITEM.ID
    LOG.REC<2> = PO.ID
    LOG.REC<3> = ORDER.QTY
    LOG.REC<4> = DATE()
    LOG.REC<5> = SUP.EMAIL
    WRITE LOG.REC ON LOG.FILE, ITEM.ID:"*":DATE()

    ORDER.COUNT += 1
    PRINT "PO raised: ":PO.ID:" for ":ORDER.QTY:" x ":ITEM.ID

REPEAT

PRINT "Reorder run complete."
PRINT "Orders raised : ":ORDER.COUNT
PRINT "Items skipped : ":SKIP.COUNT

STOP
END`,
  },
  {
    name: 'General Ledger Reconciliation',
    filename: 'GL.RECONCILE.bp',
    code: `* ============================================================
* GL.RECONCILE - End-of-month general ledger reconciliation
* Balances debits/credits, detects discrepancies, posts journal
* ============================================================
PROGRAM GL.RECONCILE

EQU TOLERANCE TO 0.01   ;* Rounding tolerance in currency

OPEN 'GL.ACCOUNTS'   TO GLA.FILE  ELSE STOP "Cannot open GL.ACCOUNTS"
OPEN 'TRANSACTIONS'  TO TXN.FILE  ELSE STOP "Cannot open TRANSACTIONS"
OPEN 'JOURNALS'      TO JNL.FILE  ELSE STOP "Cannot open JOURNALS"
OPEN 'RECON.ERRORS'  TO ERR.FILE  ELSE STOP "Cannot open RECON.ERRORS"
OPEN 'PERIOD.CLOSE'  TO PER.FILE  ELSE STOP "Cannot open PERIOD.CLOSE"

MONTH.END    = DATE()   ;* Assumes run on last day of month
PERIOD.KEY   = OCONV(MONTH.END, 'DY'):'-':OCONV(MONTH.END, 'DM')
TOTAL.DEBIT  = 0
TOTAL.CREDIT = 0
ERROR.COUNT  = 0
ACCOUNT.COUNT = 0

* Process each GL account
SELECT GLA.FILE WITH ACCOUNT.ACTIVE = 1
LOOP
    READNEXT ACCT.ID ELSE EXIT
    READ ACCT.REC FROM GLA.FILE, ACCT.ID ELSE CONTINUE

    ACCT.NAME    = ACCT.REC<1>
    ACCT.TYPE    = ACCT.REC<2>   ;* ASSET, LIABILITY, EQUITY, INCOME, EXPENSE
    OPEN.BAL     = ACCT.REC<3>
    EXPECTED.BAL = ACCT.REC<4>

    DEBIT.SUM  = 0
    CREDIT.SUM = 0

    * Sum all transactions for this account this period
    SELECT TXN.FILE WITH TXN.ACCOUNT = ACCT.ID AND TXN.PERIOD = PERIOD.KEY
    LOOP
        READNEXT TXN.ID ELSE EXIT
        READ TXN.REC FROM TXN.FILE, TXN.ID THEN
            TXN.TYPE   = TXN.REC<2>   ;* DR or CR
            TXN.AMOUNT = TXN.REC<3>
            TXN.STATUS = TXN.REC<5>

            IF TXN.STATUS = 'REVERSED' THEN CONTINUE

            IF NOT(NUM(TXN.AMOUNT)) THEN
                GOSUB LOG.ERROR
                CONTINUE
            END

            CASE TXN.TYPE
            CASE TXN.TYPE = 'DR'
                DEBIT.SUM += TXN.AMOUNT
            CASE TXN.TYPE = 'CR'
                CREDIT.SUM += TXN.AMOUNT
            CASE 1
                PRINT "WARNING: Unknown TXN type ":TXN.TYPE:" on ":TXN.ID
            END CASE
        END
    REPEAT

    * Calculate closing balance based on account type
    BEGIN CASE
    CASE ACCT.TYPE = 'ASSET' OR ACCT.TYPE = 'EXPENSE'
        CLOSING.BAL = OPEN.BAL + DEBIT.SUM - CREDIT.SUM
    CASE ACCT.TYPE = 'LIABILITY' OR ACCT.TYPE = 'EQUITY' OR ACCT.TYPE = 'INCOME'
        CLOSING.BAL = OPEN.BAL - DEBIT.SUM + CREDIT.SUM
    CASE 1
        PRINT "ERROR: Unknown account type ":ACCT.TYPE:" for ":ACCT.ID
        ERROR.COUNT += 1
        CONTINUE
    END CASE

    * Check against expected balance
    VARIANCE = ABS(CLOSING.BAL - EXPECTED.BAL)
    IF VARIANCE > TOLERANCE THEN
        ERR.REC<1> = ACCT.ID
        ERR.REC<2> = ACCT.NAME
        ERR.REC<3> = EXPECTED.BAL
        ERR.REC<4> = CLOSING.BAL
        ERR.REC<5> = VARIANCE
        ERR.REC<6> = PERIOD.KEY
        WRITE ERR.REC ON ERR.FILE, ACCT.ID:"*":PERIOD.KEY
        ERROR.COUNT += 1
        PRINT "DISCREPANCY: ":ACCT.ID:' ':ACCT.NAME:" expected ":EXPECTED.BAL:" got ":CLOSING.BAL
    END

    TOTAL.DEBIT  += DEBIT.SUM
    TOTAL.CREDIT += CREDIT.SUM
    ACCOUNT.COUNT += 1

    * Update closing balance on account
    ACCT.REC<5> = CLOSING.BAL
    ACCT.REC<6> = PERIOD.KEY
    WRITE ACCT.REC ON GLA.FILE, ACCT.ID

REPEAT

* Check overall debit = credit (double-entry rule)
IF ABS(TOTAL.DEBIT - TOTAL.CREDIT) > TOLERANCE THEN
    PRINT "CRITICAL: Trial balance out by ":ABS(TOTAL.DEBIT - TOTAL.CREDIT)
    ERROR.COUNT += 1
END ELSE
    PRINT "Trial balance: OK"
END

* Write period-close record
PER.REC<1> = PERIOD.KEY
PER.REC<2> = DATE()
PER.REC<3> = ACCOUNT.COUNT
PER.REC<4> = TOTAL.DEBIT
PER.REC<5> = TOTAL.CREDIT
PER.REC<6> = ERROR.COUNT
PER.REC<7> = IF ERROR.COUNT = 0 THEN 'CLEAN' ELSE 'ERRORS'
WRITE PER.REC ON PER.FILE, PERIOD.KEY

PRINT "Reconciliation complete. Errors: ":ERROR.COUNT
STOP

LOG.ERROR:
    ERR.REC<1> = TXN.ID
    ERR.REC<2> = 'NON_NUMERIC_AMOUNT'
    ERR.REC<3> = TXN.REC<3>
    WRITE ERR.REC ON ERR.FILE, TXN.ID
    ERROR.COUNT += 1
RETURN

END`,
  },
  {
    name: 'Student Grades & GPA Calculator',
    filename: 'STUDENT.GRADES.bp',
    code: `* ============================================================
* STUDENT.GRADES - End-of-term grade processing and GPA
* Applies weighting, handles incomplete/retake rules
* ============================================================
PROGRAM STUDENT.GRADES

EQU PASS.MARK     TO 50
EQU HONOURS.MARK  TO 70
EQU RETAKE.LIMIT  TO 2

OPEN 'STUDENTS'    TO STU.FILE   ELSE STOP "Cannot open STUDENTS"
OPEN 'ENROLLMENTS' TO ENR.FILE   ELSE STOP "Cannot open ENROLLMENTS"
OPEN 'ASSESSMENTS' TO ASS.FILE   ELSE STOP "Cannot open ASSESSMENTS"
OPEN 'TRANSCRIPTS' TO TRS.FILE   ELSE STOP "Cannot open TRANSCRIPTS"
OPEN 'MODULES'     TO MOD.FILE   ELSE STOP "Cannot open MODULES"

TERM.CODE    = 'T':OCONV(DATE(), 'DY'):'-2'
AWARD.COUNT  = 0
FAIL.COUNT   = 0

SELECT STU.FILE WITH STU.STATUS = 'ENROLLED'
LOOP
    READNEXT STU.ID ELSE EXIT
    READ STU.REC FROM STU.FILE, STU.ID ELSE CONTINUE

    STU.NAME   = STU.REC<1>
    PROGRAMME  = STU.REC<2>
    YEAR       = STU.REC<3>
    RETAKES    = STU.REC<4>

    WEIGHTED.SUM  = 0
    TOTAL.CREDITS = 0
    MODULE.COUNT  = 0
    HAS.FAIL      = 0
    INCOMPLETE    = 0

    * Retrieve all module enrolments for this term
    SELECT ENR.FILE WITH ENR.STUDENT = STU.ID AND ENR.TERM = TERM.CODE
    LOOP
        READNEXT ENR.KEY ELSE EXIT
        READ ENR.REC FROM ENR.FILE, ENR.KEY ELSE CONTINUE

        MOD.ID   = ENR.REC<1>
        CREDITS  = 0
        MOD.WEIGHT = 1.0

        READ MOD.REC FROM MOD.FILE, MOD.ID THEN
            CREDITS    = MOD.REC<3>
            MOD.WEIGHT = MOD.REC<4>   ;* Weighting factor
        END

        * Gather assessment scores for module
        FINAL.SCORE = 0
        ASS.COUNT   = 0
        SELECT ASS.FILE WITH ASS.STUDENT = STU.ID AND ASS.MODULE = MOD.ID AND ASS.TERM = TERM.CODE
        LOOP
            READNEXT ASS.KEY ELSE EXIT
            READ ASS.REC FROM ASS.FILE, ASS.KEY THEN
                SCORE      = ASS.REC<3>
                ASS.WEIGHT = ASS.REC<4>
                STATUS     = ASS.REC<5>   ;* SUBMITTED, MISSING, PENDING

                IF STATUS = 'PENDING' OR STATUS = 'MISSING' THEN
                    INCOMPLETE = 1
                END ELSE
                    IF NUM(SCORE) THEN
                        FINAL.SCORE += SCORE * ASS.WEIGHT
                        ASS.COUNT   += ASS.WEIGHT
                    END
                END
            END
        REPEAT

        * Normalise score
        IF ASS.COUNT > 0 THEN
            MODULE.SCORE = FINAL.SCORE / ASS.COUNT
        END ELSE
            MODULE.SCORE = 0
            INCOMPLETE = 1
        END

        IF MODULE.SCORE < PASS.MARK THEN HAS.FAIL = 1

        WEIGHTED.SUM   += MODULE.SCORE * CREDITS * MOD.WEIGHT
        TOTAL.CREDITS  += CREDITS * MOD.WEIGHT
        MODULE.COUNT   += 1
    REPEAT

    * Calculate GPA (0-4.0 scale)
    IF TOTAL.CREDITS > 0 THEN
        AVERAGE.MARK = WEIGHTED.SUM / TOTAL.CREDITS
        GPA = (AVERAGE.MARK / 100) * 4.0
    END ELSE
        AVERAGE.MARK = 0
        GPA = 0
    END

    * Determine award class
    BEGIN CASE
    CASE INCOMPLETE
        AWARD = 'INCOMPLETE'
    CASE HAS.FAIL AND RETAKES >= RETAKE.LIMIT
        AWARD = 'WITHDRAWN'
        FAIL.COUNT += 1
    CASE HAS.FAIL
        AWARD = 'RETAKE_REQUIRED'
        STU.REC<4> = RETAKES + 1
        WRITE STU.REC ON STU.FILE, STU.ID
        FAIL.COUNT += 1
    CASE AVERAGE.MARK >= HONOURS.MARK
        AWARD = 'HONOURS'
        AWARD.COUNT += 1
    CASE AVERAGE.MARK >= PASS.MARK
        AWARD = 'PASS'
        AWARD.COUNT += 1
    CASE 1
        AWARD = 'FAIL'
        FAIL.COUNT += 1
    END CASE

    * Write transcript
    TRS.KEY = STU.ID:"*":TERM.CODE
    TRS.REC<1>  = STU.NAME
    TRS.REC<2>  = PROGRAMME
    TRS.REC<3>  = TERM.CODE
    TRS.REC<4>  = MODULE.COUNT
    TRS.REC<5>  = TOTAL.CREDITS
    TRS.REC<6>  = AVERAGE.MARK
    TRS.REC<7>  = GPA
    TRS.REC<8>  = AWARD
    TRS.REC<9>  = DATE()
    WRITE TRS.REC ON TRS.FILE, TRS.KEY

    PRINT STU.ID:"  ":STU.NAME "L#30":"  GPA: ":GPA "R#5":"  ":AWARD

REPEAT

PRINT "Term ":TERM.CODE:" processed. Awards: ":AWARD.COUNT:"  Fails/Retakes: ":FAIL.COUNT
STOP
END`,
  },
  {
    name: 'Bank Account Interest Posting',
    filename: 'INTEREST.POST.bp',
    code: `* ============================================================
* INTEREST.POST - Monthly interest calculation and posting
* Handles savings, current, ISA and fixed-term accounts
* ============================================================
PROGRAM INTEREST.POST

EQU DAYS.IN.YEAR TO 365

OPEN 'ACCOUNTS'      TO ACC.FILE   ELSE STOP "Cannot open ACCOUNTS"
OPEN 'RATE.TABLE'    TO RATE.FILE  ELSE STOP "Cannot open RATE.TABLE"
OPEN 'TRANSACTIONS'  TO TXN.FILE   ELSE STOP "Cannot open TRANSACTIONS"
OPEN 'STATEMENTS'    TO STM.FILE   ELSE STOP "Cannot open STATEMENTS"
OPEN 'INTEREST.LOG'  TO INT.FILE   ELSE STOP "Cannot open INTEREST.LOG"

POSTING.DATE  = DATE()
MONTH.DAYS    = 30   ;* Simplified; production would calc actual
TOTAL.POSTED  = 0
ACCOUNT.COUNT = 0
ERROR.COUNT   = 0

SELECT ACC.FILE WITH ACCOUNT.STATUS = 'ACTIVE'
LOOP
    READNEXT ACCT.ID ELSE EXIT
    READU ACC.REC FROM ACC.FILE, ACCT.ID LOCKED
        PRINT "Account ":ACCT.ID:" locked - skip"
        CONTINUE
    END ELSE
        CONTINUE
    END

    ACCT.TYPE   = ACC.REC<1>   ;* SAVINGS, CURRENT, ISA, FIXED
    BALANCE     = ACC.REC<2>
    RATE.BAND   = ACC.REC<3>
    TIER.THRESHOLD = ACC.REC<4>
    LAST.INT.DATE  = ACC.REC<5>
    TAX.EXEMPT     = ACC.REC<6>   ;* ISA flag
    PENALTY.FLAG   = ACC.REC<7>
    MIN.BALANCE    = ACC.REC<8>

    * Skip accounts with penalties
    IF PENALTY.FLAG = 'Y' THEN
        RELEASE ACC.FILE, ACCT.ID
        CONTINUE
    END

    * Skip if below minimum balance
    IF BALANCE < MIN.BALANCE THEN
        RELEASE ACC.FILE, ACCT.ID
        CONTINUE
    END

    * Look up interest rate
    READ RATE.REC FROM RATE.FILE, RATE.BAND THEN
        BASE.RATE      = RATE.REC<1>
        TIER.BONUS     = RATE.REC<2>   ;* Extra rate above tier threshold
        WITHHOLD.RATE  = RATE.REC<3>   ;* Tax withholding rate
    END ELSE
        PRINT "ERROR: No rate for band ":RATE.BAND:" on ":ACCT.ID
        RELEASE ACC.FILE, ACCT.ID
        ERROR.COUNT += 1
        CONTINUE
    END

    * Tiered interest: different rates above/below threshold
    IF BALANCE > TIER.THRESHOLD AND TIER.THRESHOLD > 0 THEN
        INT.LOWER = TIER.THRESHOLD      * BASE.RATE  / 100 / DAYS.IN.YEAR * MONTH.DAYS
        INT.UPPER = (BALANCE - TIER.THRESHOLD) * (BASE.RATE + TIER.BONUS) / 100 / DAYS.IN.YEAR * MONTH.DAYS
        GROSS.INTEREST = INT.LOWER + INT.UPPER
    END ELSE
        GROSS.INTEREST = BALANCE * BASE.RATE / 100 / DAYS.IN.YEAR * MONTH.DAYS
    END

    * Apply tax withholding (skip for ISA)
    IF TAX.EXEMPT = 'Y' THEN
        TAX.WITHHELD = 0
        NET.INTEREST = GROSS.INTEREST
    END ELSE
        TAX.WITHHELD = GROSS.INTEREST * WITHHOLD.RATE / 100
        NET.INTEREST = GROSS.INTEREST - TAX.WITHHELD
    END

    NET.INTEREST = INT(NET.INTEREST * 100) / 100   ;* Round to 2dp

    * Post interest transaction
    TXN.ID = 'INT-':ACCT.ID:'-':POSTING.DATE
    TXN.REC<1> = ACCT.ID
    TXN.REC<2> = 'CR'
    TXN.REC<3> = NET.INTEREST
    TXN.REC<4> = POSTING.DATE
    TXN.REC<5> = 'INTEREST_CREDIT'
    TXN.REC<6> = 'AUTO'
    WRITE TXN.REC ON TXN.FILE, TXN.ID

    * Update account balance
    ACC.REC<2> = BALANCE + NET.INTEREST
    ACC.REC<5> = POSTING.DATE
    WRITE ACC.REC ON ACC.FILE, ACCT.ID

    * Log interest details
    INT.REC<1> = ACCT.ID
    INT.REC<2> = GROSS.INTEREST
    INT.REC<3> = TAX.WITHHELD
    INT.REC<4> = NET.INTEREST
    INT.REC<5> = POSTING.DATE
    WRITE INT.REC ON INT.FILE, TXN.ID

    TOTAL.POSTED  += NET.INTEREST
    ACCOUNT.COUNT += 1

REPEAT

PRINT "Interest posting complete."
PRINT "Accounts processed : ":ACCOUNT.COUNT
PRINT "Total interest paid: ":OCONV(TOTAL.POSTED, "MD2,$")
PRINT "Errors             : ":ERROR.COUNT
STOP
END`,
  },
  {
    name: 'Commission Calculation Engine',
    filename: 'COMMISSION.CALC.bp',
    code: `* ============================================================
* COMMISSION.CALC - Multi-tier sales commission processor
* Handles quota attainment, accelerators and claw-back rules
* ============================================================
PROGRAM COMMISSION.CALC

EQU QUOTA.TIER1 TO 0.80   ;* 80% of quota
EQU QUOTA.TIER2 TO 1.00   ;* 100%
EQU QUOTA.TIER3 TO 1.20   ;* 120%
EQU RATE.TIER1  TO 0.05
EQU RATE.TIER2  TO 0.08
EQU RATE.TIER3  TO 0.12
EQU CLAWBACK.DAYS TO 90

OPEN 'SALESREPS'    TO REP.FILE   ELSE STOP "Cannot open SALESREPS"
OPEN 'SALES.ORDERS' TO ORD.FILE   ELSE STOP "Cannot open SALES.ORDERS"
OPEN 'COMMISSIONS'  TO COM.FILE   ELSE STOP "Cannot open COMMISSIONS"
OPEN 'ADJUSTMENTS'  TO ADJ.FILE   ELSE STOP "Cannot open ADJUSTMENTS"
OPEN 'PAY.PERIODS'  TO PPD.FILE   ELSE STOP "Cannot open PAY.PERIODS"

PAY.PERIOD = 'PP':OCONV(DATE(), 'DY'):'-':OCONV(DATE(), 'DM')
PERIOD.START = DATE() - 30
PERIOD.END   = DATE()
TOTAL.COMMISSION = 0

SELECT REP.FILE WITH REP.STATUS = 'ACTIVE'
LOOP
    READNEXT REP.ID ELSE EXIT
    READ REP.REC FROM REP.FILE, REP.ID ELSE CONTINUE

    REP.NAME     = REP.REC<1>
    QUOTA        = REP.REC<2>
    PLAN.TYPE    = REP.REC<3>   ;* STANDARD, ACCELERATED, DRAW
    DRAW.AMOUNT  = REP.REC<4>   ;* Guaranteed draw for DRAW plan
    TERRITORY    = REP.REC<5>

    PERIOD.SALES   = 0
    RETURNED.SALES = 0
    BONUS.AMT      = 0

    * Sum all closed orders in period
    SELECT ORD.FILE WITH ORD.REP = REP.ID AND ORD.CLOSE.DATE >= PERIOD.START AND ORD.CLOSE.DATE <= PERIOD.END
    LOOP
        READNEXT ORD.ID ELSE EXIT
        READ ORD.REC FROM ORD.FILE, ORD.ID THEN
            ORD.VALUE   = ORD.REC<3>
            ORD.STATUS  = ORD.REC<4>
            ORD.TYPE    = ORD.REC<5>   ;* NEW, RENEWAL, EXPANSION

            BEGIN CASE
            CASE ORD.STATUS = 'CLOSED_WON'
                IF ORD.TYPE = 'RENEWAL' THEN
                    PERIOD.SALES += ORD.VALUE * 0.5   ;* 50% credit for renewals
                END ELSE
                    PERIOD.SALES += ORD.VALUE
                END
            CASE ORD.STATUS = 'RETURNED'
                RETURNED.SALES += ORD.VALUE
            CASE 1
                ;* ignore other statuses
            END CASE
        END
    REPEAT

    * Apply claw-back for returns
    NET.SALES = PERIOD.SALES - RETURNED.SALES
    IF NET.SALES < 0 THEN NET.SALES = 0

    * Calculate quota attainment
    IF QUOTA > 0 THEN
        ATTAINMENT = NET.SALES / QUOTA
    END ELSE
        ATTAINMENT = 0
    END

    * Apply tiered commission rate
    BEGIN CASE
    CASE ATTAINMENT >= QUOTA.TIER3
        BASE.COMM = NET.SALES * RATE.TIER3
        BONUS.AMT = NET.SALES * 0.02   ;* 2% accelerator above 120%
    CASE ATTAINMENT >= QUOTA.TIER2
        BASE.COMM = NET.SALES * RATE.TIER2
    CASE ATTAINMENT >= QUOTA.TIER1
        BASE.COMM = NET.SALES * RATE.TIER1
    CASE 1
        BASE.COMM = NET.SALES * (RATE.TIER1 * 0.5)  ;* 50% rate below 80% quota
    END CASE

    TOTAL.EARN = BASE.COMM + BONUS.AMT

    * Apply draw plan
    IF PLAN.TYPE = 'DRAW' THEN
        IF TOTAL.EARN < DRAW.AMOUNT THEN
            ADJ.AMOUNT = DRAW.AMOUNT - TOTAL.EARN
            ADJ.KEY = REP.ID:'-':PAY.PERIOD:'-DRAW'
            ADJ.REC<1> = REP.ID
            ADJ.REC<2> = 'DRAW_ADVANCE'
            ADJ.REC<3> = ADJ.AMOUNT
            ADJ.REC<4> = DATE()
            WRITE ADJ.REC ON ADJ.FILE, ADJ.KEY
            TOTAL.EARN = DRAW.AMOUNT
        END
    END

    * Check for prior period adjustments
    ADJ.KEY = REP.ID:'-':PAY.PERIOD:'-ADJ'
    READ ADJ.REC FROM ADJ.FILE, ADJ.KEY THEN
        TOTAL.EARN += ADJ.REC<3>
    END

    * Write commission record
    COM.KEY = REP.ID:'-':PAY.PERIOD
    COM.REC<1>  = REP.ID
    COM.REC<2>  = REP.NAME
    COM.REC<3>  = PAY.PERIOD
    COM.REC<4>  = QUOTA
    COM.REC<5>  = NET.SALES
    COM.REC<6>  = ATTAINMENT * 100  ;* as percentage
    COM.REC<7>  = BASE.COMM
    COM.REC<8>  = BONUS.AMT
    COM.REC<9>  = TOTAL.EARN
    COM.REC<10> = PLAN.TYPE
    WRITE COM.REC ON COM.FILE, COM.KEY

    TOTAL.COMMISSION += TOTAL.EARN
    PRINT REP.ID:"  ":REP.NAME "L#28":" Attain: ":OCONV(ATTAINMENT*100,'MD0'):"%  Comm: ":OCONV(TOTAL.EARN,'MD2,$')

REPEAT

PRINT "Total commission payable: ":OCONV(TOTAL.COMMISSION,'MD2,$')
STOP
END`,
  },
  {
    name: 'Warehouse Pick List Generator',
    filename: 'PICK.LIST.GEN.bp',
    code: `* ============================================================
* PICK.LIST.GEN - Optimised warehouse pick list generation
* Groups picks by zone/aisle, handles kit items and substitutes
* ============================================================
PROGRAM PICK.LIST.GEN

OPEN 'PICK.ORDERS'  TO PCK.FILE  ELSE STOP "Cannot open PICK.ORDERS"
OPEN 'PRODUCTS'     TO PRD.FILE  ELSE STOP "Cannot open PRODUCTS"
OPEN 'LOCATIONS'    TO LOC.FILE  ELSE STOP "Cannot open LOCATIONS"
OPEN 'PICK.LISTS'   TO LST.FILE  ELSE STOP "Cannot open PICK.LISTS"
OPEN 'KIT.ITEMS'    TO KIT.FILE  ELSE STOP "Cannot open KIT.ITEMS"
OPEN 'SUBSTITUTES'  TO SUB.FILE  ELSE STOP "Cannot open SUBSTITUTES"

SHIFT.DATE  = DATE()
SHIFT.CODE  = 'AM'  ;* or PM, NIGHT
PICK.BATCH  = 'BATCH-':TIMEDATE()
TOTAL.LINES = 0

* Collect all orders for this shift
SELECT PCK.FILE WITH PICK.DATE = SHIFT.DATE AND SHIFT = SHIFT.CODE AND STATUS = 'PENDING'
LOOP
    READNEXT ORDER.ID ELSE EXIT
    READ ORD.REC FROM PCK.FILE, ORDER.ID ELSE CONTINUE

    LINE.COUNT = DCOUNT(ORD.REC<2>, @VM)

    FOR LINE = 1 TO LINE.COUNT
        PROD.ID   = ORD.REC<2, LINE>
        QTY.NEED  = ORD.REC<3, LINE>
        IS.KIT    = 0

        * Expand kit items into components
        READ KIT.REC FROM KIT.FILE, PROD.ID THEN
            IS.KIT = 1
            COMP.COUNT = DCOUNT(KIT.REC<1>, @VM)
            FOR COMP = 1 TO COMP.COUNT
                COMP.ID  = KIT.REC<1, COMP>
                COMP.QTY = KIT.REC<2, COMP> * QTY.NEED
                GOSUB ADD.PICK.LINE
            NEXT COMP
        END ELSE
            * Regular item
            COMP.ID  = PROD.ID
            COMP.QTY = QTY.NEED
            GOSUB ADD.PICK.LINE
        END
    NEXT LINE

REPEAT

* Write consolidated pick list sorted by zone/aisle
GOSUB BUILD.SORTED.LIST

PRINT "Pick batch ":PICK.BATCH:" generated. Lines: ":TOTAL.LINES
STOP

* ------- Add a single pick line to accumulation array -------
ADD.PICK.LINE:
    READ PRD.REC FROM PRD.FILE, COMP.ID THEN
        LOC.ID = PRD.REC<4>   ;* Primary location
        STOCK  = PRD.REC<2>

        IF STOCK >= COMP.QTY THEN
            PICK.PROD  = COMP.ID
            PICK.LOC   = LOC.ID
            PICK.QTY   = COMP.QTY
        END ELSE
            * Try substitute
            READ SUB.REC FROM SUB.FILE, COMP.ID THEN
                SUB.PROD = SUB.REC<1>
                READ PRD.REC2 FROM PRD.FILE, SUB.PROD THEN
                    IF PRD.REC2<2> >= COMP.QTY THEN
                        PICK.PROD = SUB.PROD
                        PICK.LOC  = PRD.REC2<4>
                        PICK.QTY  = COMP.QTY
                        PRINT "INFO: Sub ":COMP.ID:" -> ":SUB.PROD:" for order ":ORDER.ID
                    END ELSE
                        PRINT "SHORTAGE: ":COMP.ID:" qty ":COMP.QTY:" avail ":STOCK:" for ":ORDER.ID
                        PICK.PROD = COMP.ID
                        PICK.LOC  = LOC.ID
                        PICK.QTY  = STOCK  ;* partial pick
                    END
                END
            END ELSE
                PRINT "SHORTAGE: ":COMP.ID:" no substitute. Avail: ":STOCK
                PICK.PROD = COMP.ID
                PICK.LOC  = LOC.ID
                PICK.QTY  = STOCK
            END
        END

        * Read zone and aisle for sorting
        READ LOC.REC FROM LOC.FILE, PICK.LOC THEN
            ZONE  = LOC.REC<1>
            AISLE = LOC.REC<2>
            SHELF = LOC.REC<3>
        END ELSE
            ZONE = 'ZZZ' ; AISLE = '99' ; SHELF = '99'
        END

        * Build sort key: ZONE-AISLE-SHELF-PRODUCT
        SORT.KEY = ZONE:'-':AISLE:'-':SHELF:'-':PICK.PROD

        * Store in dynamic array indexed by sort key
        PICK.DATA<-1> = SORT.KEY:"|"|ORDER.ID:"|"|PICK.PROD:"|"|PICK.LOC:"|"|PICK.QTY
        TOTAL.LINES += 1
    END ELSE
        PRINT "ERROR: Product ":COMP.ID:" not found"
    END
RETURN

* ------- Sort and write final pick list -------
BUILD.SORTED.LIST:
    SORTED.DATA = SORT(PICK.DATA)
    LIST.COUNT = DCOUNT(SORTED.DATA, @AM)
    LST.REC<1> = PICK.BATCH
    LST.REC<2> = SHIFT.DATE
    LST.REC<3> = SHIFT.CODE
    LST.REC<4> = LIST.COUNT
    FOR I = 1 TO LIST.COUNT
        ROW = SORTED.DATA<I>
        LST.REC<5, I> = FIELD(ROW, '|', 2)  ;* ORDER.ID
        LST.REC<6, I> = FIELD(ROW, '|', 3)  ;* PROD.ID
        LST.REC<7, I> = FIELD(ROW, '|', 4)  ;* LOCATION
        LST.REC<8, I> = FIELD(ROW, '|', 5)  ;* QTY
    NEXT I
    WRITE LST.REC ON LST.FILE, PICK.BATCH
RETURN

END`,
  },
  {
    name: 'Loan Repayment Schedule',
    filename: 'LOAN.SCHEDULE.bp',
    code: `* ============================================================
* LOAN.SCHEDULE - Amortisation schedule generator
* Handles fixed/variable rate, balloon payments, overpayments
* ============================================================
PROGRAM LOAN.SCHEDULE

OPEN 'LOANS'      TO LN.FILE   ELSE STOP "Cannot open LOANS"
OPEN 'REPAYMENTS' TO REP.FILE  ELSE STOP "Cannot open REPAYMENTS"
OPEN 'SCHEDULES'  TO SCH.FILE  ELSE STOP "Cannot open SCHEDULES"
OPEN 'RATE.HIST'  TO RTE.FILE  ELSE STOP "Cannot open RATE.HIST"
OPEN 'ARREARS'    TO ARR.FILE  ELSE STOP "Cannot open ARREARS"

SELECT LN.FILE WITH LOAN.STATUS = 'ACTIVE'
LOOP
    READNEXT LOAN.ID ELSE EXIT
    READU LN.REC FROM LN.FILE, LOAN.ID LOCKED ELSE CONTINUE END ELSE CONTINUE END

    PRINCIPAL     = LN.REC<1>
    ANNUAL.RATE   = LN.REC<2>
    TERM.MONTHS   = LN.REC<3>
    START.DATE    = LN.REC<4>
    LOAN.TYPE     = LN.REC<5>   ;* FIXED, VARIABLE, BALLOON
    BALLOON.AMT   = LN.REC<6>
    OVERPAY.MAX   = LN.REC<7>   ;* Max overpayment per month
    PAYMENTS.MADE = LN.REC<8>
    BALANCE.REMAINING = LN.REC<9>

    * Get current effective rate (variable may have changed)
    IF LOAN.TYPE = 'VARIABLE' THEN
        READ RTE.REC FROM RTE.FILE, LOAN.ID THEN
            ANNUAL.RATE = RTE.REC<1>   ;* Most recent rate
        END
    END

    MONTHLY.RATE = ANNUAL.RATE / 100 / 12

    * Calculate standard monthly payment (annuity formula)
    IF MONTHLY.RATE > 0 THEN
        FACTOR = (1 + MONTHLY.RATE) ^ TERM.MONTHS
        IF LOAN.TYPE = 'BALLOON' THEN
            MONTHLY.PMT = ((PRINCIPAL - (BALLOON.AMT / FACTOR)) * MONTHLY.RATE * FACTOR) / (FACTOR - 1)
        END ELSE
            MONTHLY.PMT = PRINCIPAL * (MONTHLY.RATE * FACTOR) / (FACTOR - 1)
        END
    END ELSE
        MONTHLY.PMT = PRINCIPAL / TERM.MONTHS
    END

    MONTHLY.PMT = INT(MONTHLY.PMT * 100) / 100

    * Check for actual payments received this month
    PAY.KEY = LOAN.ID:'-':OCONV(DATE(),'DY'):'-':OCONV(DATE(),'DM')
    READ REP.REC FROM REP.FILE, PAY.KEY THEN
        ACTUAL.PAYMENT = REP.REC<1>
        PAY.DATE       = REP.REC<2>
        PAY.METHOD     = REP.REC<3>
    END ELSE
        ACTUAL.PAYMENT = 0
        PAY.DATE = DATE()
        PAY.METHOD = 'NONE'
    END

    * Detect arrears
    IF ACTUAL.PAYMENT < MONTHLY.PMT AND PAYMENTS.MADE > 0 THEN
        SHORTFALL = MONTHLY.PMT - ACTUAL.PAYMENT
        ARR.KEY = LOAN.ID:'-ARREAR-':DATE()
        ARR.REC<1> = LOAN.ID
        ARR.REC<2> = SHORTFALL
        ARR.REC<3> = DATE()
        ARR.REC<4> = PAYMENTS.MADE
        WRITE ARR.REC ON ARR.FILE, ARR.KEY
        PRINT "ARREARS: ":LOAN.ID:" shortfall: ":OCONV(SHORTFALL,'MD2,$')
    END

    * Handle overpayment (up to limit)
    OVERPAY.AMOUNT = 0
    IF ACTUAL.PAYMENT > MONTHLY.PMT THEN
        EXCESS = ACTUAL.PAYMENT - MONTHLY.PMT
        IF EXCESS > OVERPAY.MAX AND OVERPAY.MAX > 0 THEN
            EXCESS = OVERPAY.MAX
        END
        OVERPAY.AMOUNT = EXCESS
    END

    * Calculate interest and principal split
    INTEREST.CHARGE = BALANCE.REMAINING * MONTHLY.RATE
    INTEREST.CHARGE = INT(INTEREST.CHARGE * 100) / 100
    PRINCIPAL.PAID  = MONTHLY.PMT - INTEREST.CHARGE + OVERPAY.AMOUNT
    IF PRINCIPAL.PAID > BALANCE.REMAINING THEN
        PRINCIPAL.PAID = BALANCE.REMAINING
    END
    NEW.BALANCE = BALANCE.REMAINING - PRINCIPAL.PAID

    * Update loan record
    LN.REC<8>  = PAYMENTS.MADE + 1
    LN.REC<9>  = NEW.BALANCE
    LN.REC<10> = DATE()  ;* Last payment date
    IF NEW.BALANCE <= 0 THEN
        LN.REC<11> = 'CLOSED'
        PRINT "CLOSED: ":LOAN.ID
    END
    WRITE LN.REC ON LN.FILE, LOAN.ID

    * Write schedule line
    SCH.KEY = LOAN.ID:'-':PAYMENTS.MADE + 1
    SCH.REC<1>  = LOAN.ID
    SCH.REC<2>  = PAYMENTS.MADE + 1
    SCH.REC<3>  = PAY.DATE
    SCH.REC<4>  = MONTHLY.PMT
    SCH.REC<5>  = INTEREST.CHARGE
    SCH.REC<6>  = PRINCIPAL.PAID
    SCH.REC<7>  = NEW.BALANCE
    SCH.REC<8>  = PAY.METHOD
    SCH.REC<9>  = ANNUAL.RATE
    WRITE SCH.REC ON SCH.FILE, SCH.KEY

REPEAT

PRINT "Loan schedule run complete."
STOP
END`,
  },
  {
    name: 'Asset Depreciation Calculator',
    filename: 'ASSET.DEPREC.bp',
    code: `* ============================================================
* ASSET.DEPREC - Fixed asset depreciation and disposal engine
* Supports straight-line, declining balance and sum-of-years
* ============================================================
PROGRAM ASSET.DEPREC

OPEN 'FIXED.ASSETS'  TO FA.FILE   ELSE STOP "Cannot open FIXED.ASSETS"
OPEN 'DEPRECIATION'  TO DEP.FILE  ELSE STOP "Cannot open DEPRECIATION"
OPEN 'GL.JOURNAL'    TO JNL.FILE  ELSE STOP "Cannot open GL.JOURNAL"
OPEN 'DISPOSALS'     TO DIS.FILE  ELSE STOP "Cannot open DISPOSALS"

PERIOD.DATE   = DATE()
PERIOD.CODE   = OCONV(DATE(),'DY'):'-':OCONV(DATE(),'DM')
TOTAL.DEPREC  = 0
ASSET.COUNT   = 0
DISPOSE.COUNT = 0

SELECT FA.FILE WITH ASSET.STATUS = 'ACTIVE'
LOOP
    READNEXT ASSET.ID ELSE EXIT
    READU FA.REC FROM FA.FILE, ASSET.ID LOCKED ELSE CONTINUE END ELSE CONTINUE END

    COST.PRICE    = FA.REC<1>
    RESIDUAL.VAL  = FA.REC<2>
    USEFUL.LIFE   = FA.REC<3>   ;* Years
    METHOD        = FA.REC<4>   ;* SL, DB, SYD
    DB.RATE       = FA.REC<5>   ;* Declining balance rate %
    PURCHASE.DATE = FA.REC<6>
    ACCUM.DEPREC  = FA.REC<7>
    ASSET.CLASS   = FA.REC<8>   ;* PLANT, VEHICLE, IT, FURNITURE
    DISPOSAL.FLAG = FA.REC<9>

    NET.BOOK.VALUE = COST.PRICE - ACCUM.DEPREC

    * Handle disposal
    IF DISPOSAL.FLAG = 'Y' THEN
        GOSUB PROCESS.DISPOSAL
        CONTINUE
    END

    * Check if fully depreciated
    IF NET.BOOK.VALUE <= RESIDUAL.VAL THEN
        RELEASE FA.FILE, ASSET.ID
        CONTINUE
    END

    * Calculate years in service
    YEARS.IN.SERVICE = (DATE() - PURCHASE.DATE) / 365

    * Calculate annual depreciation based on method
    BEGIN CASE
    CASE METHOD = 'SL'  ;* Straight-line
        ANNUAL.DEPREC = (COST.PRICE - RESIDUAL.VAL) / USEFUL.LIFE

    CASE METHOD = 'DB'  ;* Declining balance
        ANNUAL.DEPREC = NET.BOOK.VALUE * DB.RATE / 100

    CASE METHOD = 'SYD'  ;* Sum-of-years-digits
        YEARS.REMAIN  = USEFUL.LIFE - INT(YEARS.IN.SERVICE)
        IF YEARS.REMAIN < 1 THEN YEARS.REMAIN = 1
        SYD.DENOM     = USEFUL.LIFE * (USEFUL.LIFE + 1) / 2
        ANNUAL.DEPREC = (COST.PRICE - RESIDUAL.VAL) * YEARS.REMAIN / SYD.DENOM

    CASE 1
        PRINT "ERROR: Unknown depreciation method ":METHOD:" for ":ASSET.ID
        RELEASE FA.FILE, ASSET.ID
        CONTINUE
    END CASE

    * Convert to monthly
    MONTHLY.DEPREC = INT(ANNUAL.DEPREC / 12 * 100) / 100

    * Ensure we don't go below residual value
    IF (NET.BOOK.VALUE - MONTHLY.DEPREC) < RESIDUAL.VAL THEN
        MONTHLY.DEPREC = NET.BOOK.VALUE - RESIDUAL.VAL
    END

    IF MONTHLY.DEPREC <= 0 THEN
        RELEASE FA.FILE, ASSET.ID
        CONTINUE
    END

    * Update asset record
    FA.REC<7>  = ACCUM.DEPREC + MONTHLY.DEPREC
    FA.REC<10> = PERIOD.CODE   ;* Last depreciation period
    WRITE FA.REC ON FA.FILE, ASSET.ID

    * Write depreciation entry
    DEP.KEY = ASSET.ID:'-':PERIOD.CODE
    DEP.REC<1>  = ASSET.ID
    DEP.REC<2>  = PERIOD.CODE
    DEP.REC<3>  = MONTHLY.DEPREC
    DEP.REC<4>  = ACCUM.DEPREC + MONTHLY.DEPREC
    DEP.REC<5>  = NET.BOOK.VALUE - MONTHLY.DEPREC
    DEP.REC<6>  = METHOD
    WRITE DEP.REC ON DEP.FILE, DEP.KEY

    * Post GL journal (DR Depreciation Expense / CR Accumulated Depreciation)
    JNL.ID = 'JNL-DEPREC-':ASSET.ID:'-':PERIOD.CODE
    JNL.REC<1> = ASSET.CLASS:'.DEPREC.EXP'
    JNL.REC<2> = 'DR'
    JNL.REC<3> = MONTHLY.DEPREC
    JNL.REC<4> = PERIOD.CODE
    JNL.REC<5> = 'DEPRECIATION'
    JNL.REC<6> = ASSET.ID
    WRITE JNL.REC ON JNL.FILE, JNL.ID:'-DR'
    JNL.REC<1> = ASSET.CLASS:'.ACCUM.DEPREC'
    JNL.REC<2> = 'CR'
    WRITE JNL.REC ON JNL.FILE, JNL.ID:'-CR'

    TOTAL.DEPREC  += MONTHLY.DEPREC
    ASSET.COUNT   += 1
REPEAT

PRINT "Depreciation run complete."
PRINT "Assets processed : ":ASSET.COUNT
PRINT "Total depreciated: ":OCONV(TOTAL.DEPREC,'MD2,$')
PRINT "Disposals handled: ":DISPOSE.COUNT
STOP

PROCESS.DISPOSAL:
    DISPOSAL.PROCEEDS = FA.REC<10>
    GAIN.LOSS = DISPOSAL.PROCEEDS - NET.BOOK.VALUE
    DIS.REC<1> = ASSET.ID
    DIS.REC<2> = DATE()
    DIS.REC<3> = NET.BOOK.VALUE
    DIS.REC<4> = DISPOSAL.PROCEEDS
    DIS.REC<5> = GAIN.LOSS
    DIS.REC<6> = IF GAIN.LOSS >= 0 THEN 'GAIN' ELSE 'LOSS'
    WRITE DIS.REC ON DIS.FILE, ASSET.ID
    FA.REC<9>  = 'DISPOSED'
    FA.REC<11> = DATE()
    WRITE FA.REC ON FA.FILE, ASSET.ID
    DISPOSE.COUNT += 1
    PRINT "DISPOSAL: ":ASSET.ID:" NBV: ":NET.BOOK.VALUE:" Proceeds: ":DISPOSAL.PROCEEDS:" ":DIS.REC<6>
RETURN

END`,
  },
  {
    name: 'Purchase Order Approval Workflow',
    filename: 'PO.APPROVAL.bp',
    code: `* ============================================================
* PO.APPROVAL - Multi-level purchase order approval routing
* Rules: value thresholds, department budget checks, escalation
* ============================================================
PROGRAM PO.APPROVAL

EQU LVL1.LIMIT  TO 5000
EQU LVL2.LIMIT  TO 25000
EQU LVL3.LIMIT  TO 100000
EQU ESCALATE.HOURS TO 48

OPEN 'PURCHASE.ORDERS' TO PO.FILE    ELSE STOP "Cannot open PURCHASE.ORDERS"
OPEN 'APPROVERS'       TO APV.FILE   ELSE STOP "Cannot open APPROVERS"
OPEN 'BUDGETS'         TO BDG.FILE   ELSE STOP "Cannot open BUDGETS"
OPEN 'APPROVAL.QUEUE'  TO QUE.FILE   ELSE STOP "Cannot open APPROVAL.QUEUE"
OPEN 'DEPARTMENTS'     TO DPT.FILE   ELSE STOP "Cannot open DEPARTMENTS"
OPEN 'NOTIFICATIONS'   TO NTF.FILE   ELSE STOP "Cannot open NOTIFICATIONS"

PROCESSED = 0
ESCALATED = 0
REJECTED  = 0

SELECT PO.FILE WITH PO.STATUS = 'PENDING_APPROVAL'
LOOP
    READNEXT PO.ID ELSE EXIT
    READU PO.REC FROM PO.FILE, PO.ID LOCKED ELSE CONTINUE END ELSE CONTINUE END

    PO.VALUE      = PO.REC<1>
    DEPT.ID       = PO.REC<2>
    REQUESTOR     = PO.REC<3>
    SUBMIT.DATE   = PO.REC<4>
    SUBMIT.TIME   = PO.REC<5>
    CURRENT.LEVEL = PO.REC<6>   ;* Current approval level (0=new)
    CATEGORY      = PO.REC<7>   ;* CAPEX, OPEX, SERVICES, ASSETS
    URGENCY       = PO.REC<8>   ;* ROUTINE, URGENT, EMERGENCY

    * Check department budget availability
    BDG.KEY = DEPT.ID:'-':OCONV(DATE(),'DY')
    READ BDG.REC FROM BDG.FILE, BDG.KEY THEN
        BUDGET.REMAINING = BDG.REC<3> - BDG.REC<4>
        IF PO.VALUE > BUDGET.REMAINING AND CATEGORY = 'OPEX' THEN
            PO.REC<9>  = 'REJECTED_BUDGET'
            PO.REC<10> = DATE()
            WRITE PO.REC ON PO.FILE, PO.ID
            GOSUB NOTIFY.REQUESTOR
            REJECTED += 1
            PRINT "REJECTED (budget): ":PO.ID:" Dept: ":DEPT.ID
            CONTINUE
        END
    END

    * Determine required approval level
    BEGIN CASE
    CASE PO.VALUE <= LVL1.LIMIT
        REQUIRED.LEVEL = 1
    CASE PO.VALUE <= LVL2.LIMIT
        REQUIRED.LEVEL = 2
    CASE PO.VALUE <= LVL3.LIMIT
        REQUIRED.LEVEL = 3
    CASE 1
        REQUIRED.LEVEL = 4  ;* Board-level
    END CASE

    * Emergency orders bypass level 1
    IF URGENCY = 'EMERGENCY' AND REQUIRED.LEVEL = 1 THEN
        REQUIRED.LEVEL = 2
    END

    * CAPEX always needs at least level 2
    IF CATEGORY = 'CAPEX' AND REQUIRED.LEVEL < 2 THEN
        REQUIRED.LEVEL = 2
    END

    * Check if escalation is needed (no action within time limit)
    IF CURRENT.LEVEL > 0 THEN
        HOURS.WAITING = ((DATE() - SUBMIT.DATE) * 24) + ((TIME() - SUBMIT.TIME) / 3600)
        IF HOURS.WAITING > ESCALATE.HOURS THEN
            CURRENT.LEVEL += 1
            PO.REC<6> = CURRENT.LEVEL
            ESCALATED += 1
            PRINT "ESCALATED: ":PO.ID:" to level ":CURRENT.LEVEL
        END
    END

    NEXT.LEVEL = MAX(CURRENT.LEVEL + 1, 1)

    * Find approver for next level in this department
    APV.KEY = DEPT.ID:'-':NEXT.LEVEL
    READ APV.REC FROM APV.FILE, APV.KEY THEN
        APPROVER.ID    = APV.REC<1>
        APPROVER.EMAIL = APV.REC<2>
        DELEGATE.ID    = APV.REC<3>   ;* Backup approver
        DELEGATE.EMAIL = APV.REC<4>
        APPROVER.OOO   = APV.REC<5>   ;* Out-of-office flag

        * Use delegate if approver is out of office
        IF APPROVER.OOO = 'Y' AND DELEGATE.ID <> '' THEN
            APPROVER.ID    = DELEGATE.ID
            APPROVER.EMAIL = DELEGATE.EMAIL
        END

        * Write to approval queue
        QUE.KEY = PO.ID:'-':NEXT.LEVEL
        QUE.REC<1> = PO.ID
        QUE.REC<2> = APPROVER.ID
        QUE.REC<3> = NEXT.LEVEL
        QUE.REC<4> = DATE()
        QUE.REC<5> = 'PENDING'
        QUE.REC<6> = REQUIRED.LEVEL
        WRITE QUE.REC ON QUE.FILE, QUE.KEY

        * Update PO status
        PO.REC<6>  = NEXT.LEVEL
        PO.REC<11> = APPROVER.ID
        PO.REC<12> = DATE()
        WRITE PO.REC ON PO.FILE, PO.ID

        * Notify approver
        NTF.REC<1> = APPROVER.EMAIL
        NTF.REC<2> = 'APPROVAL_REQUIRED'
        NTF.REC<3> = PO.ID
        NTF.REC<4> = PO.VALUE
        NTF.REC<5> = DATE()
        WRITE NTF.REC ON NTF.FILE, 'NTF-':TIMEDATE()

        PROCESSED += 1
        PRINT "Queued ":PO.ID:" Level ":NEXT.LEVEL:" -> ":APPROVER.ID
    END ELSE
        PRINT "ERROR: No approver found for ":DEPT.ID:" Level ":NEXT.LEVEL
    END

REPEAT

PRINT "Approval routing complete. Processed: ":PROCESSED:"  Escalated: ":ESCALATED:"  Rejected: ":REJECTED
STOP

NOTIFY.REQUESTOR:
    NTF.REC<1> = REQUESTOR
    NTF.REC<2> = 'PO_REJECTED'
    NTF.REC<3> = PO.ID
    NTF.REC<4> = PO.REC<9>
    NTF.REC<5> = DATE()
    WRITE NTF.REC ON NTF.FILE, 'NTF-REJ-':PO.ID
RETURN

END`,
  },
  {
    name: 'Subscription Billing Engine',
    filename: 'SUBSCRIPTION.BILL.bp',
    code: `* ============================================================
* SUBSCRIPTION.BILL - Monthly SaaS subscription billing
* Handles plan upgrades, prorations, failed payments, dunning
* ============================================================
PROGRAM SUBSCRIPTION.BILL

EQU MAX.RETRY.ATTEMPTS TO 3
EQU DUNNING.GRACE.DAYS  TO 7

OPEN 'SUBSCRIPTIONS'  TO SUB.FILE   ELSE STOP "Cannot open SUBSCRIPTIONS"
OPEN 'PLANS'          TO PLN.FILE   ELSE STOP "Cannot open PLANS"
OPEN 'INVOICES'       TO INV.FILE   ELSE STOP "Cannot open INVOICES"
OPEN 'PAYMENTS'       TO PAY.FILE   ELSE STOP "Cannot open PAYMENTS"
OPEN 'CUSTOMERS'      TO CUS.FILE   ELSE STOP "Cannot open CUSTOMERS"
OPEN 'DUNNING.LOG'    TO DUN.FILE   ELSE STOP "Cannot open DUNNING.LOG"
OPEN 'USAGE.METERS'   TO USG.FILE   ELSE STOP "Cannot open USAGE.METERS"

BILL.DATE     = DATE()
BILL.CYCLE    = OCONV(DATE(),'DY'):'-':OCONV(DATE(),'DM')
INVOICES.GEN  = 0
PAY.SUCCESS   = 0
PAY.FAILED    = 0
DUNNED        = 0

SELECT SUB.FILE WITH SUB.STATUS = 'ACTIVE' AND NEXT.BILL.DATE = BILL.DATE
LOOP
    READNEXT SUB.ID ELSE EXIT
    READU SUB.REC FROM SUB.FILE, SUB.ID LOCKED ELSE CONTINUE END ELSE CONTINUE END

    CUST.ID       = SUB.REC<1>
    PLAN.ID       = SUB.REC<2>
    BILLING.CYCLE = SUB.REC<3>   ;* MONTHLY, ANNUAL
    SEATS         = SUB.REC<4>
    PREV.PLAN     = SUB.REC<5>   ;* Set if recently upgraded
    UPGRADE.DATE  = SUB.REC<6>
    RETRY.COUNT   = SUB.REC<7>
    PAYMENT.METHOD = SUB.REC<8>
    DISCOUNT.CODE = SUB.REC<9>

    * Read plan pricing
    READ PLN.REC FROM PLN.FILE, PLAN.ID THEN
        PRICE.PER.SEAT = PLN.REC<1>
        USAGE.TIER     = PLN.REC<2>   ;* FLAT, PER_SEAT, METERED
        INCLUDED.UNITS = PLN.REC<3>
        OVERAGE.RATE   = PLN.REC<4>
    END ELSE
        PRINT "ERROR: Plan ":PLAN.ID:" not found for sub ":SUB.ID
        RELEASE SUB.FILE, SUB.ID
        CONTINUE
    END

    BASE.AMOUNT = 0
    PRORATE.CREDIT = 0
    OVERAGE.CHARGE = 0

    * Calculate base charge
    BEGIN CASE
    CASE USAGE.TIER = 'FLAT'
        BASE.AMOUNT = PRICE.PER.SEAT
    CASE USAGE.TIER = 'PER_SEAT'
        BASE.AMOUNT = PRICE.PER.SEAT * SEATS
    CASE USAGE.TIER = 'METERED'
        USG.KEY = SUB.ID:'-':BILL.CYCLE
        READ USG.REC FROM USG.FILE, USG.KEY THEN
            UNITS.USED = USG.REC<1>
            IF UNITS.USED > INCLUDED.UNITS THEN
                OVERAGE.CHARGE = (UNITS.USED - INCLUDED.UNITS) * OVERAGE.RATE
            END
        END
        BASE.AMOUNT = PRICE.PER.SEAT + OVERAGE.CHARGE
    END CASE

    * Apply proration credit if upgraded mid-cycle
    IF PREV.PLAN <> '' AND UPGRADE.DATE <> '' THEN
        DAYS.IN.MONTH = 30
        DAYS.REMAINING = BILL.DATE - UPGRADE.DATE
        READ PREV.PLN FROM PLN.FILE, PREV.PLAN THEN
            OLD.PRICE = PREV.PLN<1>
            PRORATE.CREDIT = OLD.PRICE * (DAYS.REMAINING / DAYS.IN.MONTH) * -1
        END
        SUB.REC<5> = ''  ;* Clear upgrade flags
        SUB.REC<6> = ''
    END

    * Apply discount code
    DISCOUNT.AMT = 0
    IF DISCOUNT.CODE <> '' THEN
        DISC.KEY = DISCOUNT.CODE
        * Simplified: 10% off for any valid code
        DISCOUNT.AMT = BASE.AMOUNT * 0.10
    END

    INVOICE.TOTAL = BASE.AMOUNT + PRORATE.CREDIT - DISCOUNT.AMT
    IF INVOICE.TOTAL < 0 THEN INVOICE.TOTAL = 0

    * Generate invoice
    INV.ID = 'INV-':SUB.ID:'-':BILL.CYCLE
    INV.REC<1>  = CUST.ID
    INV.REC<2>  = SUB.ID
    INV.REC<3>  = BILL.DATE
    INV.REC<4>  = BASE.AMOUNT
    INV.REC<5>  = PRORATE.CREDIT
    INV.REC<6>  = DISCOUNT.AMT
    INV.REC<7>  = INVOICE.TOTAL
    INV.REC<8>  = USAGE.TIER
    INV.REC<9>  = OVERAGE.CHARGE
    INV.REC<10> = 'PENDING'
    WRITE INV.REC ON INV.FILE, INV.ID
    INVOICES.GEN += 1

    * Attempt payment
    GOSUB ATTEMPT.PAYMENT

    * Set next billing date
    IF BILLING.CYCLE = 'ANNUAL' THEN
        SUB.REC<10> = BILL.DATE + 365
    END ELSE
        SUB.REC<10> = BILL.DATE + 30
    END
    WRITE SUB.REC ON SUB.FILE, SUB.ID

REPEAT

PRINT "Billing run complete."
PRINT "Invoices generated: ":INVOICES.GEN
PRINT "Payments succeeded: ":PAY.SUCCESS
PRINT "Payments failed   : ":PAY.FAILED
PRINT "Accounts dunned   : ":DUNNED
STOP

ATTEMPT.PAYMENT:
    PAY.REC<1> = INV.ID
    PAY.REC<2> = CUST.ID
    PAY.REC<3> = INVOICE.TOTAL
    PAY.REC<4> = PAYMENT.METHOD
    PAY.REC<5> = DATE()
    PAY.REC<6> = 'PROCESSING'
    WRITE PAY.REC ON PAY.FILE, INV.ID

    * Simulated payment gateway response (APPROVED / DECLINED)
    GATEWAY.RESULT = 'APPROVED'  ;* Replace with real call

    IF GATEWAY.RESULT = 'APPROVED' THEN
        PAY.REC<6>  = 'SUCCESS'
        INV.REC<10> = 'PAID'
        PAY.SUCCESS += 1
    END ELSE
        PAY.REC<6>  = 'FAILED'
        INV.REC<10> = 'FAILED'
        PAY.FAILED  += 1
        RETRY.COUNT += 1
        SUB.REC<7>  = RETRY.COUNT
        IF RETRY.COUNT >= MAX.RETRY.ATTEMPTS THEN
            SUB.REC<11> = 'DUNNING'
            DUN.REC<1>  = SUB.ID
            DUN.REC<2>  = CUST.ID
            DUN.REC<3>  = INVOICE.TOTAL
            DUN.REC<4>  = DATE()
            DUN.REC<5>  = RETRY.COUNT
            WRITE DUN.REC ON DUN.FILE, SUB.ID:'-':DATE()
            DUNNED += 1
        END
    END
    WRITE PAY.REC ON PAY.FILE, INV.ID
    WRITE INV.REC ON INV.FILE, INV.ID
RETURN

END`,
  },
  {
    name: 'Healthcare Patient Billing',
    filename: 'PATIENT.BILLING.bp',
    code: `* ============================================================
* PATIENT.BILLING - Hospital patient billing and insurance claim
* Applies insurance rules, co-pay, deductibles, write-offs
* ============================================================
PROGRAM PATIENT.BILLING

EQU MAX.CLAIM.AGE.DAYS TO 120   ;* Claims older than this are written off

OPEN 'PATIENTS'       TO PAT.FILE   ELSE STOP "Cannot open PATIENTS"
OPEN 'ENCOUNTERS'     TO ENC.FILE   ELSE STOP "Cannot open ENCOUNTERS"
OPEN 'INSURANCE'      TO INS.FILE   ELSE STOP "Cannot open INSURANCE"
OPEN 'FEE.SCHEDULE'   TO FEE.FILE   ELSE STOP "Cannot open FEE.SCHEDULE"
OPEN 'CLAIMS'         TO CLM.FILE   ELSE STOP "Cannot open CLAIMS"
OPEN 'PATIENT.BILLS'  TO BILL.FILE  ELSE STOP "Cannot open PATIENT.BILLS"
OPEN 'WRITE.OFFS'     TO WOF.FILE   ELSE STOP "Cannot open WRITE.OFFS"

BILL.RUN.DATE = DATE()
TOTAL.CHARGED = 0
TOTAL.COVERED = 0
TOTAL.PATIENT = 0
CLAIM.COUNT   = 0
WRITE.OFF.COUNT = 0

SELECT ENC.FILE WITH BILLING.STATUS = 'READY'
LOOP
    READNEXT ENC.ID ELSE EXIT
    READU ENC.REC FROM ENC.FILE, ENC.ID LOCKED ELSE CONTINUE END ELSE CONTINUE END

    PAT.ID         = ENC.REC<1>
    ENC.DATE       = ENC.REC<2>
    PROVIDER.ID    = ENC.REC<3>
    PROC.CODES     = ENC.REC<4>   ;* Multi-valued: procedure codes
    DIAG.CODES     = ENC.REC<5>   ;* Multi-valued: ICD-10 diagnosis codes
    INS.POLICY.ID  = ENC.REC<6>
    REFERRAL.CODE  = ENC.REC<7>
    FACILITY.CODE  = ENC.REC<8>

    * Age check - write off stale encounters
    IF (DATE() - ENC.DATE) > MAX.CLAIM.AGE.DAYS THEN
        WOF.REC<1> = ENC.ID
        WOF.REC<2> = 'TOO_OLD'
        WOF.REC<3> = DATE()
        WRITE WOF.REC ON WOF.FILE, ENC.ID
        ENC.REC<9> = 'WRITTEN_OFF'
        WRITE ENC.REC ON ENC.FILE, ENC.ID
        WRITE.OFF.COUNT += 1
        CONTINUE
    END

    * Read patient and insurance details
    READ PAT.REC FROM PAT.FILE, PAT.ID ELSE
        PRINT "ERROR: Patient ":PAT.ID:" not found for enc ":ENC.ID
        RELEASE ENC.FILE, ENC.ID
        CONTINUE
    END

    DEDUCTIBLE.MET   = PAT.REC<7>   ;* Amount of deductible already met
    DEDUCTIBLE.LIMIT = PAT.REC<8>
    OUT.OF.POCKET    = PAT.REC<9>
    OOP.MAX          = PAT.REC<10>

    INS.COVERAGE.PCT = 80   ;* Default
    CO.PAY           = 0
    INS.NETWORK.TYPE = 'IN'

    IF INS.POLICY.ID <> '' THEN
        READ INS.REC FROM INS.FILE, INS.POLICY.ID THEN
            INS.COVERAGE.PCT  = INS.REC<3>
            CO.PAY            = INS.REC<4>
            INS.NETWORK.TYPE  = INS.REC<5>   ;* IN or OUT of network
            IF INS.NETWORK.TYPE = 'OUT' THEN
                INS.COVERAGE.PCT = INS.REC<6>  ;* Lower out-of-network rate
            END
        END
    END

    * Calculate charges per procedure
    PROC.COUNT   = DCOUNT(PROC.CODES, @VM)
    TOTAL.CHARGE = 0
    CLAIM.LINES  = ''

    FOR PC = 1 TO PROC.COUNT
        PROC.CODE = PROC.CODES<1, PC>
        FEE.KEY   = PROC.CODE:'-':FACILITY.CODE

        READ FEE.REC FROM FEE.FILE, FEE.KEY THEN
            ALLOWED.AMT  = FEE.REC<1>
            BILLED.AMT   = FEE.REC<2>
        END ELSE
            * Try generic fee without facility modifier
            READ FEE.REC FROM FEE.FILE, PROC.CODE THEN
                ALLOWED.AMT = FEE.REC<1>
                BILLED.AMT  = FEE.REC<2>
            END ELSE
                PRINT "WARNING: No fee for proc ":PROC.CODE
                ALLOWED.AMT = 0 ; BILLED.AMT = 0
            END
        END

        TOTAL.CHARGE  += BILLED.AMT
        CLAIM.LINES<-1> = PROC.CODE:"|"|BILLED.AMT:"|"|ALLOWED.AMT
    NEXT PC

    * Apply deductible
    REMAINING.DED = DEDUCTIBLE.LIMIT - DEDUCTIBLE.MET
    IF REMAINING.DED < 0 THEN REMAINING.DED = 0
    DED.APPLIED = MIN(TOTAL.CHARGE, REMAINING.DED)
    AFTER.DED   = TOTAL.CHARGE - DED.APPLIED

    * Apply co-pay
    AFTER.COPAY = AFTER.DED - CO.PAY
    IF AFTER.COPAY < 0 THEN AFTER.COPAY = 0

    * Insurance covers a percentage of remainder
    INS.PAYS = AFTER.COPAY * INS.COVERAGE.PCT / 100
    PAT.PAYS = TOTAL.CHARGE - INS.PAYS

    * Apply out-of-pocket maximum
    IF (OUT.OF.POCKET + PAT.PAYS) > OOP.MAX THEN
        PAT.PAYS = OOP.MAX - OUT.OF.POCKET
        IF PAT.PAYS < 0 THEN PAT.PAYS = 0
    END

    * Update patient accumulators
    PAT.REC<7>  = DEDUCTIBLE.MET + DED.APPLIED
    PAT.REC<9>  = OUT.OF.POCKET + PAT.PAYS
    WRITE PAT.REC ON PAT.FILE, PAT.ID

    * Write insurance claim
    CLM.ID = 'CLM-':ENC.ID
    CLM.REC<1>  = ENC.ID
    CLM.REC<2>  = PAT.ID
    CLM.REC<3>  = INS.POLICY.ID
    CLM.REC<4>  = ENC.DATE
    CLM.REC<5>  = TOTAL.CHARGE
    CLM.REC<6>  = INS.PAYS
    CLM.REC<7>  = 'SUBMITTED'
    CLM.REC<8>  = BILL.RUN.DATE
    CLM.REC<9>  = CLAIM.LINES
    WRITE CLM.REC ON CLM.FILE, CLM.ID

    * Write patient bill
    BILL.ID = 'BILL-':ENC.ID
    BILL.REC<1>  = PAT.ID
    BILL.REC<2>  = ENC.ID
    BILL.REC<3>  = TOTAL.CHARGE
    BILL.REC<4>  = PAT.PAYS
    BILL.REC<5>  = CO.PAY
    BILL.REC<6>  = DED.APPLIED
    BILL.REC<7>  = BILL.RUN.DATE
    BILL.REC<8>  = 'OUTSTANDING'
    WRITE BILL.REC ON BILL.FILE, BILL.ID

    ENC.REC<9>  = 'BILLED'
    ENC.REC<10> = BILL.RUN.DATE
    WRITE ENC.REC ON ENC.FILE, ENC.ID

    TOTAL.CHARGED += TOTAL.CHARGE
    TOTAL.COVERED += INS.PAYS
    TOTAL.PATIENT += PAT.PAYS
    CLAIM.COUNT   += 1

REPEAT

PRINT "Patient billing complete."
PRINT "Claims raised : ":CLAIM.COUNT
PRINT "Total charged : ":OCONV(TOTAL.CHARGED,'MD2,$')
PRINT "Ins coverage  : ":OCONV(TOTAL.COVERED,'MD2,$')
PRINT "Patient owes  : ":OCONV(TOTAL.PATIENT,'MD2,$')
PRINT "Write-offs    : ":WRITE.OFF.COUNT
STOP
END`,
  },
  {
    name: 'Supply Chain Demand Forecast',
    filename: 'DEMAND.FORECAST.bp',
    code: `* ============================================================
* DEMAND.FORECAST - Rolling demand forecast using weighted avg
* Applies seasonality, trend, and exception handling
* ============================================================
PROGRAM DEMAND.FORECAST

EQU FORECAST.PERIODS  TO 3     ;* Months to forecast ahead
EQU ALPHA             TO 0.4   ;* Exponential smoothing weight
EQU TREND.WEIGHT      TO 0.2
EQU SEASON.PERIODS    TO 12    ;* Months for seasonality

OPEN 'PRODUCTS'      TO PRD.FILE   ELSE STOP "Cannot open PRODUCTS"
OPEN 'SALES.HISTORY' TO SLS.FILE   ELSE STOP "Cannot open SALES.HISTORY"
OPEN 'FORECASTS'     TO FCS.FILE   ELSE STOP "Cannot open FORECASTS"
OPEN 'SEASON.INDEX'  TO SEA.FILE   ELSE STOP "Cannot open SEASON.INDEX"
OPEN 'EXCEPTIONS'    TO EXC.FILE   ELSE STOP "Cannot open EXCEPTIONS"

FORE.DATE    = DATE()
FORE.PERIOD  = OCONV(FORE.DATE,'DY'):'-':OCONV(FORE.DATE,'DM')
PROD.COUNT   = 0
EXCEP.COUNT  = 0

SELECT PRD.FILE WITH FORECAST.FLAG = 'Y'
LOOP
    READNEXT PROD.ID ELSE EXIT
    READ PRD.REC FROM PRD.FILE, PROD.ID ELSE CONTINUE

    PROD.CAT    = PRD.REC<1>
    LEAD.TIME   = PRD.REC<3>  ;* Days
    LAST.SMOOTH = PRD.REC<8>  ;* Last smoothed forecast value
    LAST.TREND  = PRD.REC<9>  ;* Last trend component
    MOQ         = PRD.REC<5>  ;* Minimum order quantity

    * Collect last 12 months of actual sales
    TOTAL.SALES  = 0
    PERIOD.COUNT = 0
    MONTHLY.VALS = ''

    FOR M = SEASON.PERIODS TO 1 STEP -1
        HIST.DATE   = FORE.DATE - (M * 30)
        HIST.PERIOD = OCONV(HIST.DATE,'DY'):'-':OCONV(HIST.DATE,'DM')
        HIST.KEY    = PROD.ID:'-':HIST.PERIOD
        READ SLS.REC FROM SLS.FILE, HIST.KEY THEN
            ACTUAL.UNITS = SLS.REC<1>
            * Exclude outliers (> 3x average)
            IF PERIOD.COUNT > 0 THEN
                RUNNING.AVG = TOTAL.SALES / PERIOD.COUNT
                IF ACTUAL.UNITS > (RUNNING.AVG * 3) AND RUNNING.AVG > 0 THEN
                    PRINT "OUTLIER: ":PROD.ID:" period ":HIST.PERIOD:" units ":ACTUAL.UNITS:" (avg ":RUNNING.AVG:")"
                    ACTUAL.UNITS = RUNNING.AVG  ;* Replace with average
                    EXCEP.COUNT += 1
                END
            END
            TOTAL.SALES  += ACTUAL.UNITS
            PERIOD.COUNT += 1
            MONTHLY.VALS<-1> = ACTUAL.UNITS
        END ELSE
            MONTHLY.VALS<-1> = 0
        END
    NEXT M

    IF PERIOD.COUNT = 0 THEN CONTINUE

    BASE.AVG = TOTAL.SALES / PERIOD.COUNT

    * Read seasonality indices for this product category
    READ SEA.REC FROM SEA.FILE, PROD.CAT ELSE
        MAT SEA.REC(12)
        FOR I = 1 TO 12 ; SEA.REC(I) = 1.0 ; NEXT I
    END

    * Apply Holt exponential smoothing
    IF LAST.SMOOTH = '' OR LAST.SMOOTH = 0 THEN
        LAST.SMOOTH = BASE.AVG
        LAST.TREND  = 0
    END

    LAST.ACTUAL = MONTHLY.VALS<PERIOD.COUNT>
    NEW.SMOOTH  = ALPHA * LAST.ACTUAL + (1 - ALPHA) * (LAST.SMOOTH + LAST.TREND)
    NEW.TREND   = TREND.WEIGHT * (NEW.SMOOTH - LAST.SMOOTH) + (1 - TREND.WEIGHT) * LAST.TREND

    * Generate forecast for next N periods
    FOR FP = 1 TO FORECAST.PERIODS
        FCT.DATE   = FORE.DATE + (FP * 30)
        FCT.MONTH  = MOD(OCONV(FCT.DATE,'DM') - 1, 12) + 1
        SEASON.IDX = SEA.REC(FCT.MONTH)

        RAW.FORECAST = (NEW.SMOOTH + FP * NEW.TREND) * SEASON.IDX
        IF RAW.FORECAST < 0 THEN RAW.FORECAST = 0
        FORECAST.UNITS = INT(RAW.FORECAST + 0.5)  ;* Round to nearest whole unit

        * Enforce MOQ
        IF FORECAST.UNITS > 0 AND FORECAST.UNITS < MOQ THEN
            FORECAST.UNITS = MOQ
        END

        FCT.PERIOD = OCONV(FCT.DATE,'DY'):'-':OCONV(FCT.DATE,'DM')
        FCT.KEY    = PROD.ID:'-':FCT.PERIOD

        FCT.REC<1>  = PROD.ID
        FCT.REC<2>  = FCT.PERIOD
        FCT.REC<3>  = FORECAST.UNITS
        FCT.REC<4>  = SEASON.IDX
        FCT.REC<5>  = RAW.FORECAST
        FCT.REC<6>  = FORE.DATE
        FCT.REC<7>  = NEW.SMOOTH
        FCT.REC<8>  = NEW.TREND
        WRITE FCT.REC ON FCS.FILE, FCT.KEY
    NEXT FP

    * Update product smoothing values
    PRD.REC<8> = NEW.SMOOTH
    PRD.REC<9> = NEW.TREND
    WRITE PRD.REC ON PRD.FILE, PROD.ID

    PROD.COUNT += 1

REPEAT

PRINT "Demand forecast complete."
PRINT "Products forecast: ":PROD.COUNT
PRINT "Outliers adjusted: ":EXCEP.COUNT
STOP
END`,
  },
];

export default function CreateJobPage() {
  const navigate = useNavigate();
  const createJob = useCreateJob();

  const [jobName, setJobName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceFilename, setSourceFilename] = useState('');
  const [sourceCode, setSourceCode] = useState('');
  const [sampleIndex, setSampleIndex] = useState(0);
  const [touched, setTouched] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const codeBg = useColorModeValue('gray.50', 'gray.900');

  const codeError = touched && sourceCode.trim().length < 10
    ? 'Source code must be at least 10 characters'
    : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (sourceCode.trim().length < 10) return;

    const result = await createJob.mutateAsync({
      job_name: jobName.trim() || undefined,
      description: description.trim() || undefined,
      source_filename: sourceFilename.trim() || undefined,
      original_source_code: sourceCode,
    });

    navigate(`/jobs/${result.id}`);
  };

  const handleLoadSample = () => {
    const sample = SAMPLES[sampleIndex % SAMPLES.length];
    setSourceCode(sample.code.trim());
    setSourceFilename(sample.filename);
    setJobName(sample.name);
    setSampleIndex((prev) => (prev + 1) % SAMPLES.length);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    const file = e.target.files?.[0];

    // Reset so the same file can be re-selected later
    e.target.value = '';

    if (!file) return;

    // Guard: 500 KB max
    if (file.size > 512_000) {
      setUploadError('File is too large. Maximum allowed size is 500 KB.');
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== 'string') {
        setUploadError('Could not read the file. Please try again.');
        return;
      }

      // Guard: warn if file looks binary (many non-printable chars)
      const nonPrintable = (text.match(/[\x00-\x08\x0E-\x1F\x7F]/g) ?? []).length;
      if (nonPrintable > 10) {
        setUploadError('File does not appear to be a plain-text Pick Basic source file.');
        return;
      }

      // Normalise Windows line endings
      const code = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // Derive a clean job name from the filename (strip extension)
      const nameFromFile = file.name.replace(/\.[^.]+$/, '').replace(/[._-]+/g, ' ').trim();

      setSourceCode(code);
      setSourceFilename(file.name);
      setJobName(nameFromFile);
    };

    reader.onerror = () => {
      setUploadError('An error occurred while reading the file.');
    };

    reader.readAsText(file);
  };

  return (
    <Container maxW="3xl" py={8}>
      {/* Header */}
      <Flex align="center" gap={3} mb={8}>
        <Button
          leftIcon={<FiArrowLeft />}
          variant="ghost"
          size="sm"
          onClick={() => navigate('/jobs')}
        >
          Back to Jobs
        </Button>
        <Divider orientation="vertical" h={6} />
        <HStack spacing={3}>
          <Icon as={FiCode} boxSize={6} color="brand.400" />
          <Heading size="lg">New Migration Job</Heading>
        </HStack>
      </Flex>

      <form onSubmit={handleSubmit}>
        {/* Hidden file input — triggered by Upload File button */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".bp,.b,.pick,.txt"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
        <VStack spacing={6} align="stretch">
          {/* Job Details card */}
          <Box
            bg={bg}
            border="1px solid"
            borderColor={borderColor}
            borderRadius="xl"
            p={6}
          >
            <Heading size="sm" mb={4} color="gray.400" textTransform="uppercase" letterSpacing="wider">
              Job Details
            </Heading>

            <VStack spacing={4} align="stretch">
              <FormControl>
                <FormLabel>Job Name <Text as="span" color="gray.500" fontWeight="normal">(optional)</Text></FormLabel>
                <Input
                  placeholder="e.g. Customer Migration Q1 2026"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  maxLength={255}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Description <Text as="span" color="gray.500" fontWeight="normal">(optional)</Text></FormLabel>
                <Textarea
                  placeholder="Brief description of this migration job…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  resize="vertical"
                />
              </FormControl>

              <FormControl>
                  <FormLabel>Source Filename <Text as="span" color="gray.500" fontWeight="normal">(optional)</Text></FormLabel>
                  <Input
                    placeholder="e.g. CUSTOMERS.PICK"
                    value={sourceFilename}
                    onChange={(e) => setSourceFilename(e.target.value)}
                    fontFamily="mono"
                    fontSize="sm"
                    maxLength={255}
                  />
                </FormControl>
            </VStack>
          </Box>

          {/* Source code card */}
          <Box
            bg={bg}
            border="1px solid"
            borderColor={borderColor}
            borderRadius="xl"
            p={6}
          >
            <Flex justify="space-between" align="center" mb={4}>
              <Heading size="sm" color="gray.400" textTransform="uppercase" letterSpacing="wider">
                Pick Basic Source Code
              </Heading>
              <HStack spacing={2}>
                <Button
                  size="xs"
                  variant="ghost"
                  leftIcon={<FiUpload />}
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload a Pick Basic source file from your computer"
                >
                  Upload File
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  leftIcon={<FiUploadCloud />}
                  onClick={handleLoadSample}
                  title={`Load sample ${(sampleIndex % SAMPLES.length) + 1} of ${SAMPLES.length}: ${SAMPLES[sampleIndex % SAMPLES.length].name}`}
                >
                  Load sample ({(sampleIndex % SAMPLES.length) + 1}/{SAMPLES.length})
                </Button>
              </HStack>
            </Flex>

            {uploadError && (
              <Alert status="error" borderRadius="md" mb={4} fontSize="sm" py={2}>
                <AlertIcon boxSize={4} />
                <Text flex={1}>{uploadError}</Text>
                <CloseButton
                  size="sm"
                  ml={2}
                  onClick={() => setUploadError('')}
                  aria-label="Dismiss error"
                />
              </Alert>
            )}

            <FormControl isRequired isInvalid={!!codeError}>
              <Textarea
                placeholder="Paste your Pick Basic source code here…"
                value={sourceCode}
                onChange={(e) => setSourceCode(e.target.value)}
                onBlur={() => setTouched(true)}
                rows={18}
                fontFamily="mono"
                fontSize="sm"
                bg={codeBg}
                resize="vertical"
                spellCheck={false}
              />
              {!codeError && (
                <FormHelperText>
                  {sourceCode.length > 0
                    ? `${sourceCode.split('\n').length} lines · ${sourceCode.length} chars`
                    : 'Paste the complete Pick Basic source code to migrate'}
                </FormHelperText>
              )}
              {codeError && <FormErrorMessage>{codeError}</FormErrorMessage>}
            </FormControl>
          </Box>

          {/* Process info */}
          <Alert status="info" borderRadius="lg" fontSize="sm">
            <AlertIcon />
            <Box>
              <Text fontWeight="semibold" mb={1}>Two-step migration workflow</Text>
              <Text>After creation, the AI generates a YAML specification based on the source code. Once the YAML is reviewed and approved, the job enters the queue. Open the <strong>Studio</strong> to pick it up from the queue, select a target language, and generate the final code.</Text>
              <Button
                mt={2}
                size="xs"
                leftIcon={<FiLayout />}
                colorScheme="purple"
                variant="outline"
                onClick={() => navigate('/')}
              >
                Open Studio
              </Button>
            </Box>
          </Alert>

          {/* Actions */}
          <Flex justify="flex-end" gap={3}>
            <Button
              variant="ghost"
              onClick={() => navigate('/jobs')}
              isDisabled={createJob.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              colorScheme="brand"
              leftIcon={<FiCode />}
              isLoading={createJob.isPending}
              loadingText="Creating…"
            >
              Create Migration Job
            </Button>
          </Flex>
        </VStack>
      </form>
    </Container>
  );
}
