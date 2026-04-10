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

  checkPageBreak(40);

  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.text('Spending by Category', margin, yPos);
  yPos += 8;

  // Table Header Background
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, yPos - 5, pageWidth - (margin * 2), 10, 'F');
  
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('CATEGORY', margin + 5, yPos + 2);
  doc.text('PERCENT', margin + 70, yPos + 2);
  doc.text('TOTAL AMOUNT', pageWidth - margin - 5, yPos + 2, { align: 'right' });
  yPos += 10;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  
  // Sort categories by amount descending
  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a);

  for (const [cat, amount] of sortedCategories) {
    checkPageBreak(8);
    const percent = ((amount / (totalSpent || 1)) * 100).toFixed(1);
    
    doc.text(cat, margin + 5, yPos);
    doc.text(`${percent}%`, margin + 70, yPos);
    doc.text(`EGP ${amount.toLocaleString()}`, pageWidth - margin - 5, yPos, { align: 'right' });
    
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, yPos + 2, pageWidth - margin, yPos + 2);
    yPos += 8;
  }

  yPos += 10;

  // Expenses Table Summary Header
  checkPageBreak(25);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('All Expenses List', margin, yPos);
  yPos += 8;

  doc.setFillColor(241, 245, 249);
  doc.rect(margin, yPos - 5, pageWidth - (margin * 2), 10, 'F');

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('DATE', margin + 5, yPos + 2);
  doc.text('CATEGORY', margin + 35, yPos + 2);
  doc.text('NOTES', margin + 75, yPos + 2);
  doc.text('AMOUNT', pageWidth - margin - 5, yPos + 2, { align: 'right' });
  
  yPos += 10;

  // Expenses List
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');

  // Sort expenses for export
  const sortedExpenses = [...expenses].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    if (dateB - dateA !== 0) return dateB - dateA;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  for (const expense of sortedExpenses) {
    checkPageBreak(10);

    const dateStr = new Date(expense.date).toLocaleDateString();
    doc.text(dateStr, margin + 5, yPos);
    doc.text(expense.category || 'Other', margin + 35, yPos);
    
    // Truncate notes if too long
    let notes = expense.notes || '-';
    if (notes.length > 35) notes = notes.substring(0, 32) + '...';
    doc.text(notes, margin + 75, yPos);
    
    doc.text(`EGP ${expense.cost?.toFixed(2)}`, pageWidth - margin - 5, yPos, { align: 'right' });
    
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, yPos + 2, pageWidth - margin, yPos + 2);
    yPos += 8;
  }

  // Detailed Pages Section (Modified to be more compact and only break pages when needed)
  doc.addPage();
  yPos = margin;
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Detailed Expense Report', margin, yPos);
  yPos += 15;

  for (const expense of sortedExpenses) {
    const urls = expense.receipt_urls?.length > 0 ? expense.receipt_urls : (expense.receipt_url ? [expense.receipt_url] : []);
    const hasReceipts = urls.length > 0;
    
    // Estimate height needed for text info
    let textHeight = 35;
    const splitNotes = expense.notes ? doc.splitTextToSize(`Notes: ${expense.notes}`, pageWidth - (margin * 2) - 10) : [];
    if (expense.notes) {
      textHeight += (splitNotes.length * 6);
    }

    // Check if we need a page break for the header/text info
    if (checkPageBreak(textHeight + 10)) {
      // yPos is reset to margin
    }

    // Expense Box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), textHeight, 2, 2, 'FD');
    
    const innerY = yPos + 8;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(expense.category || 'Other', margin + 5, innerY);
    doc.text(`EGP ${expense.cost?.toFixed(2)}`, pageWidth - margin - 5, innerY, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Date: ${new Date(expense.date).toLocaleDateString()}`, margin + 5, innerY + 8);
    
    if (expense.assigned_to) {
      doc.text(`Assigned to: ${expense.assigned_to}`, pageWidth - margin - 5, innerY + 8, { align: 'right' });
    }

    if (expense.notes) {
      doc.setTextColor(50, 50, 50);
      doc.text(splitNotes, margin + 5, innerY + 18);
    }
    
    yPos += textHeight + 5;

    // Receipts for this specific expense
    if (hasReceipts) {
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        
        try {
          const imgData = await getImageData(url);
          const props = doc.getImageProperties(imgData);
          const maxWidth = pageWidth - (margin * 2) - 10;
          const maxHeight = 120; 
          
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

          // Check if image fits on current page
          if (yPos + h + 10 > pageHeight - margin) {
            doc.addPage();
            yPos = margin;
          }

          doc.addImage(imgData, 'JPEG', margin + 5, yPos, w, h);
          yPos += h + 10;
        } catch (e) {
          doc.setFontSize(9);
          doc.setTextColor(200, 50, 50);
          doc.text(`[Error loading receipt ${i + 1}]`, margin + 5, yPos);
          yPos += 10;
        }
      }
    }
    
    yPos += 5; // Space between expenses
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