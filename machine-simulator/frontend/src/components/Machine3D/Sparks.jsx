import { Sparkles } from '@react-three/drei';

export default function Sparks({ aiStatus = 'OK', riskScore = 0 }) {
  const critical = aiStatus === 'CRITICAL' || riskScore >= 0.7;
  if (!critical) return null;

  return (
    <Sparkles
      count={45}
      scale={[2.4, 1.6, 1.0]}
      size={4.0}
      speed={0.7}
      noise={1.2}
      color="#ff8844"
      position={[0, 1.4, 0]}
    />
  );
}
