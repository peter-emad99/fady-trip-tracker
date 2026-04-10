import jsPDF from 'jspdf';

export const exportTripToPDF = async (trip, expenses) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPos = margin;

  // Helper to check page break
  const checkPageBreak = (heightNeeded) => {
    if (yPos + heightNeeded > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };

  // Title
  doc.setFontSize(24);
  doc.setTextColor(0, 0, 0);
  doc.text(trip.name, margin, yPos);
  yPos += 10;

  // Trip Info
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  const dates = `${trip.start_date || 'TBD'} - ${trip.end_date || 'TBD'}`;
  doc.text(dates, margin, yPos);
  yPos += 15;

  // Summary Stats
  const totalSpent = expenses.reduce((acc, curr) => acc + (curr.cost || 0), 0);
  const remaining = (trip.received_amount || 0) - totalSpent;

  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 25, 3, 3, 'FD');
  
  yPos += 7;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('BUDGET', margin + 5, yPos);
  doc.text('SPENT', margin + 65, yPos);
  doc.text('REMAINING', margin + 125, yPos);
  
  yPos += 8;
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(`EGP ${trip.received_amount?.toLocaleString()}`, margin + 5, yPos);
  doc.text(`EGP ${totalSpent.toLocaleString()}`, margin + 65, yPos);
  doc.setTextColor(remaining < 0 ? 220 : 0, remaining < 0 ? 20 : 150, remaining < 0 ? 60 : 100);
  doc.text(`EGP ${remaining.toLocaleString()}`, margin + 125, yPos);
  
  yPos += 25;

  // Category Breakdown
  const categoryTotals = expenses.reduce((acc, curr) => {
    const cat = curr.category || 'Other';
    acc[cat] = (acc[cat] || 0) + (curr.cost || 0);
    return acc;
  }, {});

  checkPageBreak(30); // Ensure space for header

  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Category Breakdown', margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  
  // Table Header
  doc.text('CATEGORY', margin, yPos);
  doc.text('TOTAL', margin + 80, yPos);
  yPos += 3;
  
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, yPos, margin + 120, yPos);
  yPos += 7;

  doc.setTextColor(0, 0, 0);
  
  // Sort categories by amount descending
  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a);

  for (const [cat, amount] of sortedCategories) {
    checkPageBreak(7);
    doc.text(cat, margin, yPos);
    doc.text(`EGP ${amount.toLocaleString()}`, margin + 80, yPos);
    yPos += 7;
  }

  yPos += 15;

  // Expenses Table Header
  checkPageBreak(20);
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('DATE', margin, yPos);
  doc.text('CATEGORY', margin + 30, yPos);
  doc.text('NOTES', margin + 70, yPos);
  doc.text('AMOUNT', pageWidth - margin, yPos, { align: 'right' });
  
  yPos += 5;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  // Expenses List
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Sort expenses for export
  const sortedExpenses = [...expenses].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    if (dateB - dateA !== 0) return dateB - dateA;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  for (const expense of sortedExpenses) {
    checkPageBreak(15);

    const dateStr = new Date(expense.date).toLocaleDateString();
    doc.text(dateStr, margin, yPos);
    doc.text(expense.category || 'Other', margin + 30, yPos);
    
    // Truncate notes if too long
    let notes = expense.notes || '-';
    if (notes.length > 30) notes = notes.substring(0, 27) + '...';
    doc.text(notes, margin + 70, yPos);
    
    doc.text(`EGP ${expense.cost?.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 8;
  }

  // Detailed Pages Section - Only for expenses with receipts
  const expensesWithReceipts = sortedExpenses.filter(expense => {
    const urls = expense.receipt_urls?.length > 0 ? expense.receipt_urls : (expense.receipt_url ? [expense.receipt_url] : []);
    return urls.length > 0;
  });

  if (expensesWithReceipts.length > 0) {
    for (const expense of expensesWithReceipts) {
      doc.addPage();
      yPos = margin;

      // Header Card
      const cardHeight = 35;
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, yPos, pageWidth - (margin * 2), cardHeight, 3, 3, 'FD');
      
      const innerY = yPos + 12;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(expense.category || 'Other', margin + 5, innerY);
      
      doc.setFontSize(14);
      doc.setTextColor(239, 68, 68);
      doc.text(`EGP ${expense.cost?.toFixed(2)}`, pageWidth - margin - 5, innerY, { align: 'right' });
      
      yPos += cardHeight + 5;

      // Metadata
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`Date: ${new Date(expense.date).toLocaleDateString()}`, margin, yPos);
      
      if (expense.assigned_to) {
          doc.text(`Assigned to: ${expense.assigned_to}`, pageWidth - margin, yPos, { align: 'right' });
      }
      yPos += 12;

      // Notes
      if (expense.notes) {
        doc.setFontSize(12);
        doc.setTextColor(50, 50, 50);
        const splitNotes = doc.splitTextToSize(`Notes: ${expense.notes}`, pageWidth - (margin * 2));
        doc.text(splitNotes, margin, yPos);
        yPos += (splitNotes.length * 7) + 15;
      } else {
        yPos += 10;
      }

      // Receipts for this specific expense
      const urls = expense.receipt_urls?.length > 0 ? expense.receipt_urls : (expense.receipt_url ? [expense.receipt_url] : []);
      
      if (urls.length > 0) {
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 12;

        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text('Receipts:', margin, yPos);
        yPos += 10;

        for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        
        try {
          const imgData = await getImageData(url);
          const props = doc.getImageProperties(imgData);
          const maxWidth = pageWidth - (margin * 2);
          const maxHeight = 160; 
          
          let w = props.width;
          let h = props.height;
          
          if (w > maxWidth) {
            h = (h * maxWidth) / w;
            w = maxWidth;
          }
          if (h > maxHeight) {
            w = (w * maxHeight) / h;
            h = maxHeight;
          }

          if (yPos + h > pageHeight - margin) {
            doc.addPage();
            yPos = margin;
          }

          doc.addImage(imgData, 'JPEG', margin, yPos, w, h);
          yPos += h + 15;
        } catch (e) {
          doc.setFontSize(9);
          doc.setTextColor(200, 50, 50);
          doc.text(`[Error loading receipt ${i + 1}]`, margin, yPos);
          yPos += 10;
        }
      }
    }
  }

  doc.save(`${trip.name.replace(/\s+/g, '_')}_Report.pdf`);
};

// Helper to convert URL to base64 for jsPDF
function getImageData(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous"; 
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg'));
    };
    img.onerror = reject;
    img.src = url;
  });
}