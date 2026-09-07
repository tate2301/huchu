import re, collections
txt=open('/home/user/huchu/prisma/schema.prisma').read()
models=re.findall(r'^model (\w+) \{(.*?)^\}', txt, re.S|re.M)
names={m for m,_ in models}
def dom(n):
    for p,d in (('School','schools'),('Crm','crm'),('Retail','retail'),('Gold','gold'),('Buyer','gold'),('Settlement','settlements'),
                ('Payroll','payroll'),('Disbursement','payroll'),('Compensation','payroll'),('Paye','payroll'),('Statutory','payroll'),('TaxCredit','payroll'),('Nec','payroll'),('FixedSalary','payroll'),('EmployeePayment','payroll'),('Adjustment','payroll'),('Approval','payroll'),
                ('Leave','hr'),('PublicHoliday','hr'),('HrIncident','hr'),('Disciplinary','hr'),('Training','hr'),('Employee','hr'),('Department','hr'),('JobGrade','hr'),('Attendance','hr'),('ShiftGroup','hr'),
                ('Inventory','inventory'),('StockLocation','inventory'),('StockMovement','inventory'),('Product','catalogue'),('PriceList','catalogue'),
                ('Equipment','maintenance'),('WorkOrder','maintenance'),('DowntimeCode','operations'),('DowntimeEvent','operations'),('ShiftReport','operations'),('PlantReport','operations'),
                ('Permit','compliance'),('Inspection','compliance'),('Incident','compliance'),
                ('Document','documents'),('Notification','notifications'),('UserNotification','notifications'),('WebPush','notifications'),
                ('Account','auth'),('Session','auth'),('VerificationToken','auth'),('User','platform'),('Company','platform'),('Site','platform'),('Section','platform'),('IdSequence','platform'),('GlobalIdSequence','platform'),('Subscription','platform'),('Platform','platform'),('Feature','platform'),('Marketing','platform'),('Provisioning','platform'),('Subdomain','platform'),('Support','platform'),('Runbook','platform'),('Tenant','platform'),('Health','platform'),('Contract','platform'),('Payment','platform'),
                ('Fiscal','accounting'),('Vat','accounting'),('Bank','accounting'),('Tender','accounting'),('Currency','accounting'),('Cost','accounting'),('Opening','accounting'),('Period','accounting'),('Journal','accounting'),('Posting','accounting'),('Tax','accounting'),('Chart','accounting'),('Accounting','accounting'),('Customer','accounting'),('Vendor','accounting'),('Sales','accounting'),('Credit','accounting'),('Purchase','accounting'),('Debit','accounting'),('Editing','gold')):
        if n.startswith(p): return d
    return 'other'
# relations: field lines "name Type" or "Type[]" or "Type?" where Type in names
cross=collections.Counter(); detail=collections.defaultdict(list)
for m,body in models:
    dm=dom(m)
    for line in body.splitlines():
        line=line.strip()
        if not line or line.startswith('@@') or line.startswith('//'): continue
        parts=line.split()
        if len(parts)<2: continue
        t=parts[1].rstrip('[]?')
        if t in names and t!=m:
            dt=dom(t)
            if dt!=dm and not (dt=='platform' and t in ('Company','User','Site','Section')):
                cross[(dm,dt)]+=1; detail[(dm,dt)].append(f"{m}.{parts[0]} -> {t}")
for (a,b),c in sorted(cross.items(), key=lambda x:-x[1]):
    print(f"{a:12s} -> {b:12s} {c}")
    for d in detail[(a,b)][:12]: print("     ",d)
print()
print("model counts by domain:")
cnt=collections.Counter(dom(m) for m,_ in models)
for d,c in cnt.most_common(): print(f"  {d:12s} {c}")
print("other:", [m for m,_ in models if dom(m)=='other'])
