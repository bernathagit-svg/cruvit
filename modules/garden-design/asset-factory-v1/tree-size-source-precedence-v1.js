/**
 * Conservative precedence for contradictory size wording on the SAME authority page.
 * A structured Dimensions field may outrank prose only when:
 * - all competing complete records are from the same exact source URL/identifier;
 * - their height ranges agree exactly;
 * - exactly one record is explicitly structured as "Dimensions:";
 * - horizontal ranges differ.
 * No averaging. Different-source conflicts are never resolved here.
 */
export function selectSameSourceStructuredDimensionsRecord(rows=[]){
  const complete=rows.filter((row)=>
    row?.evidenceClass==='SOURCE_SUPPORTED_RANGE'
    && (Number.isFinite(row.heightMinM)||Number.isFinite(row.heightMaxM))
    && (Number.isFinite(row.spreadMinM)||Number.isFinite(row.spreadMaxM))
  );
  if(complete.length<2) return null;
  const sourceKeys=new Set(complete.map((row)=>String(row.sourceUrl||row.sourceIdentifier||'')));
  if(sourceKeys.size!==1 || [...sourceKeys][0]==='') return null;
  const heightKeys=new Set(complete.map((row)=>JSON.stringify({
    min:row.heightMinM??null,max:row.heightMaxM??null
  })));
  if(heightKeys.size!==1) return null;
  const spreadKeys=new Set(complete.map((row)=>JSON.stringify({
    min:row.spreadMinM??null,max:row.spreadMaxM??null
  })));
  if(spreadKeys.size<2) return null;
  const structured=complete.filter((row)=>/\bDimensions\s*:/i.test(String(row.originalSourceWording||'')));
  if(structured.length!==1) return null;
  return structured[0];
}
