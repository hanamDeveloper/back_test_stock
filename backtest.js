const fs = require('fs');
const csv = require('csv-parse');

/**
 * CSV 파싱을 Promise로 반환하는 함수
 */
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    fs.createReadStream(filePath)
      .pipe(csv({ columns: true, trim: true }))
      .on('data', (row) => {
        records.push(row);
      })
      .on('end', () => {
        resolve(records);
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

/**
 * 전략 구현: S&P 500이 하락할 때만 그 하락분(달러)를 UPRO에 옮김
 * @param {Object[]} spData - 날짜별로 정렬된 S&P500 CSV 데이터 (Date, Close)
 * @param {Object[]} uproData - 날짜별로 정렬된 UPRO CSV 데이터 (Date, Close)
 * @param {number} initialCapital - 시작 자본 (예: 100 달러)
 * @returns {Object} 최종 평가액 및 상세 내역
 */
function backtestStrategy(spData, uproData, initialCapital = 100) {
  // S&P 500과 UPRO의 평가액
  let spValue = initialCapital;
  let uproValue = 0;

  // (선택) 일자별 기록을 남기고 싶다면 배열 생성
  const dailyLog = [];

  // 첫 번째 행은 '첫날'로 가정 -> 보유만 하고 재조정은 없음
  // 따라서 루프는 두 번째 행(i=1)부터 시작
  for (let i = 1; i < spData.length; i++) {
    const prevSpClose = parseFloat(spData[i - 1].Close);
    const currSpClose = parseFloat(spData[i].Close);

    const prevUproClose = parseFloat(uproData[i - 1].Close);
    const currUproClose = parseFloat(uproData[i].Close);

    // 매일 S&P 500, UPRO 가치는 전일 종가 대비 오늘 종가 변동 비율로 업데이트
    // 예: 오늘 S&P 500 종가 / 어제 종가 = 1.01이라면, S&P 보유가치도 *1.01
    spValue *= (currSpClose / prevSpClose);
    uproValue *= (currUproClose / prevUproClose);

    // 오늘 일자 기준, S&P 500 하루 변화율(%) 계산
    const dailyChange = (currSpClose - prevSpClose) / prevSpClose; // 예: -0.01 = -1%

    // 만약 하락(-X%) 했다면, '그 하락 금액만큼'을 S&P 500에서 빼서 UPRO에 추가
    // dailyChange가 -0.01(-1%) 라면, spValue의 1%에 해당하는 금액만큼 UPRO로 이동
    if (dailyChange < 0) {
      const absDollarLoss = spValue * Math.abs(dailyChange);
      spValue -= absDollarLoss;
      uproValue += absDollarLoss;
    }

    // 로그 남기기 (선택)
    dailyLog.push({
      Date: spData[i].Date,
      spValue: spValue.toFixed(2),
      uproValue: uproValue.toFixed(2),
      total: (spValue + uproValue).toFixed(2),
    });
  }

  // 최종 결과
  const finalTotal = spValue + uproValue;
  return {
    finalSP: spValue,
    finalUPRO: uproValue,
    finalTotal,
    dailyLog,
  };
}

/**
 * 메인 실행 함수
 * sp500.csv, upro.csv를 읽어 백테스트 실행
 */
async function main() {
  try {
    const spData = await parseCSV('S&P_500_과거_데이터_20150101.csv');
    const uproData = await parseCSV('UPRO_과거_데이터_20150101.csv');

    // 날짜 기준 정렬 (CSV가 이미 정렬되어 있다면 생략 가능)
    spData.sort((a, b) => new Date(a.Date) - new Date(b.Date));
    uproData.sort((a, b) => new Date(a.Date) - new Date(b.Date));

    // 두 CSV 파일의 행 수가 같고, 날짜가 동일하다고 가정
    // (다르다면 날짜별 매칭 작업 필요)
    if (spData.length !== uproData.length) {
      throw new Error('SP500과 UPRO CSV 행 수가 다릅니다. 날짜 매칭 작업이 필요합니다.');
    }

    const result = backtestStrategy(spData, uproData, 100);

    console.log('최종 S&P 500 평가액:', result.finalSP.toFixed(2));
    console.log('최종 UPRO 평가액:', result.finalUPRO.toFixed(2));
    console.log('최종 총합:', result.finalTotal.toFixed(2));

    // 필요하다면 일자별 로그도 확인
    // console.log(result.dailyLog);

  } catch (error) {
    console.error('에러 발생:', error);
  }
}

// 날짜 필터링 함수 추가
function filterDataByDate(matchedData, startDate, endDate) {
  if (!startDate && !endDate) return matchedData;
  
  return matchedData.filter(row => {
    const rowDate = new Date(row.Date);
    if (startDate && rowDate < new Date(startDate)) return false;
    if (endDate && rowDate > new Date(endDate)) return false;
    return true;
  });
}

// 메인 실행 부분 수정
document.getElementById("runButton").addEventListener("click", async () => {
  const spFile = document.getElementById('spFile').files[0];
  const uproFile = document.getElementById('uproFile').files[0];
  const monthlyContribution = parseFloat(document.getElementById('monthlyInput').value);
  const initialCapital = parseFloat(document.getElementById('initialCapitalInput').value);
  const dipMultiplier = parseFloat(document.getElementById('dipMultiplierInput').value);
  
  // 날짜 입력값 가져오기
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  // 기존 유효성 검사에 날짜 검사 추가
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    alert("시작일이 종료일보다 늦을 수 없습니다.");
    return;
  }

  try {
    // CSV 파싱
    const spData = await parseCSV(spFile);
    const uproData = await parseCSV(uproFile);

    // 날짜 매칭
    let matchedData = buildMatchedData(spData, uproData);
    if (matchedData.length < 2) {
      throw new Error("매칭된 날짜가 너무 적습니다(2개 미만).");
    }

    // 날짜 필터링 적용
    matchedData = filterDataByDate(matchedData, startDate, endDate);
    if (matchedData.length < 2) {
      throw new Error("선택된 기간에 데이터가 충분하지 않습니다(2개 미만).");
    }

    // 나머지 코드는 동일...

  } catch (error) {
    console.error('에러 발생:', error);
  }
});

main();
