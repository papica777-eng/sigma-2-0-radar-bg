use std::f64::consts::PI;

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf: Vec<u8> = Vec::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    if !ptr.is_null() && len > 0 {
        drop(Vec::from_raw_parts(ptr, 0, len));
    }
}

const H0: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

fn compress(state: &mut [u32; 8], block: &[u8; 64]) {
    let mut w = [0u32; 64];
    for i in 0..16 {
        let j = i * 4;
        w[i] = u32::from_be_bytes([block[j], block[j + 1], block[j + 2], block[j + 3]]);
    }
    for i in 16..64 {
        let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
        let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
    }

    let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = *state;
    for i in 0..64 {
        let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let ch = (e & f) ^ ((!e) & g);
        let temp1 = h.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
        let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let maj = (a & b) ^ (a & c) ^ (b & c);
        let temp2 = s0.wrapping_add(maj);

        h = g;
        g = f;
        f = e;
        e = d.wrapping_add(temp1);
        d = c;
        c = b;
        b = a;
        a = temp1.wrapping_add(temp2);
    }

    state[0] = state[0].wrapping_add(a);
    state[1] = state[1].wrapping_add(b);
    state[2] = state[2].wrapping_add(c);
    state[3] = state[3].wrapping_add(d);
    state[4] = state[4].wrapping_add(e);
    state[5] = state[5].wrapping_add(f);
    state[6] = state[6].wrapping_add(g);
    state[7] = state[7].wrapping_add(h);
}

pub fn sha256_bytes(data: &[u8]) -> [u8; 32] {
    let mut state = H0;
    let mut chunks = data.chunks_exact(64);
    for chunk in &mut chunks {
        let mut block = [0u8; 64];
        block.copy_from_slice(chunk);
        compress(&mut state, &block);
    }

    let rem = chunks.remainder();
    let mut tail = [0u8; 128];
    tail[..rem.len()].copy_from_slice(rem);
    tail[rem.len()] = 0x80;

    let total_bits = (data.len() as u64).wrapping_mul(8);
    let blocks = if rem.len() < 56 { 1 } else { 2 };
    let len_offset = blocks * 64 - 8;
    tail[len_offset..len_offset + 8].copy_from_slice(&total_bits.to_be_bytes());

    let mut b0 = [0u8; 64];
    b0.copy_from_slice(&tail[..64]);
    compress(&mut state, &b0);
    if blocks == 2 {
        let mut b1 = [0u8; 64];
        b1.copy_from_slice(&tail[64..128]);
        compress(&mut state, &b1);
    }

    let mut out = [0u8; 32];
    for i in 0..8 {
        out[i * 4..i * 4 + 4].copy_from_slice(&state[i].to_be_bytes());
    }
    out
}

#[no_mangle]
pub unsafe extern "C" fn sha256_hash(ptr: *const u8, len: usize, out_ptr: *mut u8) -> u32 {
    if out_ptr.is_null() || (ptr.is_null() && len > 0) {
        return 0;
    }
    let slice = if len == 0 { &[] } else { std::slice::from_raw_parts(ptr, len) };
    let digest = sha256_bytes(slice);
    let out = std::slice::from_raw_parts_mut(out_ptr, 32);
    out.copy_from_slice(&digest);
    32
}

#[inline]
fn is_word_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

pub fn count_standalone_10_digits(data: &[u8]) -> u32 {
    let mut count = 0u32;
    let mut i = 0usize;
    let n = data.len();
    while i < n {
        if data[i].is_ascii_digit() {
            let start = i;
            while i < n && data[i].is_ascii_digit() {
                i += 1;
            }
            if i - start == 10 {
                let left_ok = start == 0 || !is_word_byte(data[start - 1]);
                let right_ok = i == n || !is_word_byte(data[i]);
                if left_ok && right_ok {
                    count += 1;
                }
            }
        } else {
            i += 1;
        }
    }
    count
}

#[no_mangle]
pub unsafe extern "C" fn scan_egn_count(ptr: *const u8, len: usize) -> u32 {
    if ptr.is_null() && len > 0 {
        return u32::MAX;
    }
    let slice = if len == 0 { &[] } else { std::slice::from_raw_parts(ptr, len) };
    count_standalone_10_digits(slice)
}

const LANCZOS_COEFFS: [f64; 9] = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
];

pub fn lgamma_approx(z: f64) -> f64 {
    if z < 0.5 {
        (PI / (PI * z).sin()).ln() - lgamma_approx(1.0 - z)
    } else {
        let z1 = z - 1.0;
        let mut x = LANCZOS_COEFFS[0];
        for (i, &c) in LANCZOS_COEFFS.iter().enumerate().skip(1) {
            x += c / (z1 + (i as f64));
        }
        let t = z1 + 7.5;
        0.5 * (2.0 * PI).ln() + (z1 + 0.5) * t.ln() - t + x.ln()
    }
}

#[no_mangle]
pub extern "C" fn binomial_upper_tail(k: u32, n: u32, p: f64) -> f64 {
    if k == 0 {
        return 1.0;
    }
    if k > n || p <= 0.0 || !p.is_finite() {
        return 0.0;
    }
    if p >= 1.0 {
        return 1.0;
    }
    let log_p = p.ln();
    let log_1mp = (-p).ln_1p();
    let nf = n as f64;
    let lg_np1 = lgamma_approx(nf + 1.0);

    let mut max_lp = f64::NEG_INFINITY;
    for x in k..=n {
        let xf = x as f64;
        let lp = lg_np1
            - lgamma_approx(xf + 1.0)
            - lgamma_approx(nf - xf + 1.0)
            + xf * log_p
            + (nf - xf) * log_1mp;
        if lp > max_lp {
            max_lp = lp;
        }
    }
    if !max_lp.is_finite() {
        return 0.0;
    }

    let mut sum_scaled = 0.0f64;
    for x in k..=n {
        let xf = x as f64;
        let lp = lg_np1
            - lgamma_approx(xf + 1.0)
            - lgamma_approx(nf - xf + 1.0)
            + xf * log_p
            + (nf - xf) * log_1mp;
        sum_scaled += (lp - max_lp).exp();
    }
    let res = sum_scaled * max_lp.exp();
    res.clamp(0.0, 1.0)
}

#[no_mangle]
pub extern "C" fn bh_fdr_bound(p_val: f64, rank: u32, total_tests: u32) -> f64 {
    if !p_val.is_finite() {
        return 1.0;
    }
    let r = rank.max(1) as f64;
    let m = total_tests.max(1) as f64;
    (p_val * m / r).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn to_hex(bytes: &[u8; 32]) -> String {
        bytes.iter().map(|b| format!("{:02x}", b)).collect()
    }

    #[test]
    fn sha256_nist_vectors() {
        assert_eq!(
            to_hex(&sha256_bytes(b"")),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            to_hex(&sha256_bytes(b"abc")),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            to_hex(&sha256_bytes(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
    }

    #[test]
    fn egn_scanner_word_boundaries() {
        assert_eq!(count_standalone_10_digits(b"EIK 129009710 and EGN 01234567890"), 0);
        assert_eq!(count_standalone_10_digits(b"bad: 8801011234, ok: 123456789"), 1);
        assert_eq!(count_standalone_10_digits(b"no_digits_foo1234567890bar"), 0);
    }

    #[test]
    fn binomial_and_fdr_accuracy() {
        let fair = binomial_upper_tail(10, 20, 0.5);
        assert!((fair - 0.5880985260009766).abs() < 1e-9);
        let extreme = binomial_upper_tail(345, 789, 60.69 / 789.0);
        assert!(extreme > 0.0 && extreme < 1e-150);
        let q = bh_fdr_bound(3.597e-167, 1, 62166);
        assert!(q < 1e-160);
    }
}
