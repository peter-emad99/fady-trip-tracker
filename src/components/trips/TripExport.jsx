import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export default function TripExport({ trip, expenses }) {
  const handleExport = async () => {
    const doc = new jsPDF();
    let yPos = 20;

    // Helper to check page bounds
    const checkPageBreak = (heightNeeded) => {
      if (yPos + heightNeeded > 280) {
        doc.addPage();
        yPos = 20;
        return true;
      }
      return false;
    };

    // Title
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text(trip.name, 14, yPos);
    yPos += 10;

    // Trip Info
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    const dateStr = `${trip.start_date ? format(new Date(trip.start_date), 'MMM d, yyyy') : 'TBD'} - ${trip.end_date ? format(new Date(trip.end_date), 'MMM d, yyyy') : 'TBD'}`;
    doc.text(dateStr, 14, yPos);
    yPos += 15;

    // Financial Summary
    const totalSpent = expenses.reduce((acc, curr) => acc + (curr.cost || 0), 0);
    const remaining = (trip.received_amount || 0) - totalSpent;

    doc.setDrawColor(200, 200, 200);
    doc.line(14, yPos, 196, yPos);
    yPos += 10;

    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`Budget: EGP ${trip.received_amount?.toLocaleString()}`, 14, yPos);
    yPos += 7;
    doc.text(`Spent: EGP ${totalSpent.toLocaleString()}`, 14, yPos);
    yPos += 7;
    doc.text(`Remaining: EGP ${remaining.toLocaleString()}`, 14, yPos);
    yPos += 15;

    // Expenses Table Header
    doc.setFillColor(240, 240, 240);
    doc.rect(14, yPos - 5, 182, 10, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Date', 16, yPos);
    doc.text('Category', 45, yPos);
    doc.text('Notes', 85, yPos);
    doc.text('Cost (EGP)', 170, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 10;

    // Expenses List
    for (const expense of expenses) {
      checkPageBreak(15);
      
      const expDate = format(new Date(expense.date), 'MMM d');
      const expCat = expense.category;
      const expCost = expense.cost?.toFixed(2);
      const expNotes = expense.notes || '-';
      
      // Truncate notes if too long
      const displayNotes = expNotes.length > 40 ? expNotes.substring(0, 37) + '...' : expNotes;

      doc.text(expDate, 16, yPos);
      doc.text(expCat, 45, yPos);
      doc.text(displayNotes, 85, yPos);
      doc.text(expCost, 170, yPos);
      
      yPos += 8;
    }

    yPos += 10;

    // Receipts Section
    checkPageBreak(20);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Receipts', 14, yPos);
    yPos += 10;

    // Loop through expenses with receipts
    for (const expense of expenses) {
      if (expense.receipt_url) {
        checkPageBreak(100); // Approximate space for image + caption

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`${expense.category} - ${format(new Date(expense.date), 'MMM d')} - EGP ${expense.cost}`, 14, yPos);
        yPos += 5;

        try {
          // Add image to PDF
          // Note: fetching images can be tricky due to CORS. 
          // Assuming base44 storage headers allow it or we use a proxy/workaround if needed.
          // For this implementation, we'll try adding it directly.
          const imgExt = expense.receipt_url.split('.').pop().toLowerCase();
          const format = imgExt === 'png' ? 'PNG' : 'JPEG';
          
          doc.addImage(expense.receipt_url, format, 14, yPos, 80, 60, undefined, 'FAST');
          yPos += 65;
        } catch (err) {
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(150, 0, 0);
          doc.text('(Error loading receipt image)', 14, yPos);
          yPos += 10;
          doc.setTextColor(0, 0, 0);
        }
        
        yPos += 10;
      }
    }

    doc.save(`${trip.name.replace(/\s+/g, '_')}_Report.pdf`);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
      <Download className="w-4 h-4" />
      Export
    </Button>
  );
}